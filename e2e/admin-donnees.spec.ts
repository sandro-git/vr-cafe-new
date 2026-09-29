import { expect, test } from "@playwright/test";
import { adminSessionCookie } from "./helpers/admin-session";
import { FakeApi, FakeSupabase, setNow, type ApiCall } from "./helpers/mocks";
import { chooseSlot } from "./helpers/reservation-steps";

// Les pages admin lisent réservations et clients via /api/admin/db (session
// admin + service role) : la clé anon n'y a plus accès. Le faux Supabase ne
// sert pas ces tables, donc toute lecture directe finirait dans `unhandled`.

const CLIENT_ID = "c0ffee00-0000-4000-8000-000000000001";
const resa = (over: Record<string, unknown> = {}) => ({
  id: "a1b2c3d4-0000-4000-8000-000000000001",
  client_id: CLIENT_ID,
  client_nom: "Alice Dupont",
  client_email: "alice@vr-cafe.fr",
  client_telephone: "+33 6 71 41 06 95",
  nb_personnes: 3,
  duree_minutes: 60,
  creneau_debut: "2026-10-01T13:00:00+00:00",
  creneau_fin: "2026-10-01T14:00:00+00:00",
  creneau_fin_blocage: "2026-10-01T14:30:00+00:00",
  statut: "confirmée",
  type_reservation: "standard",
  notes: null,
  created_at: "2026-09-20T10:00:00+00:00",
  reservation_boxes: [{ box_id: 1, boxes: { nom: "Box 1", type: "filaire" } }],
  ...over,
});

const reads: Record<string, (call: ApiCall) => unknown> = {
  list_reservations: () => [resa(), resa({ id: "b2", client_nom: "Bob Martin", statut: "annulée" })],
  list_clients: () => ({
    clients: [{ id: CLIENT_ID, nom: "Alice Dupont", email: "alice@vr-cafe.fr", telephone: "+33 6 71 41 06 95" }],
    reservations: [{ client_id: CLIENT_ID, statut: "confirmée", creneau_debut: "2026-09-20T13:00:00+00:00" }],
  }),
  client_reservations: () => [resa()],
  marketing_reservations: () => [resa(), resa({ client_nom: "Bob Martin", client_email: "bob@vr-cafe.fr" })],
  client_suggestions: () => [{ client_nom: "Alice Dupont", client_email: "alice@vr-cafe.fr", client_telephone: "+33 6 71 41 06 95" }],
};

let supabase: FakeSupabase;
let api: FakeApi;
const dbCalls = (action: string) => api.callsTo("/api/admin/db").filter((c) => c.body?.action === action);

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([await adminSessionCookie(baseURL!)]);
  await setNow(page, "2026-10-01T10:00:00+02:00");
  supabase = new FakeSupabase();
  api = new FakeApi({
    "/api/admin/db": ({ body }) => {
      const read = reads[body?.action];
      return read ? { body: { data: read({ body } as ApiCall) } } : undefined;
    },
  });
  await supabase.install(page);
  await api.install(page);
});

test.afterEach(() => {
  expect(supabase.unhandled).toEqual([]);
});

test("/admin/reservations : badge 🎁 des bons cadeaux rattachés, lien vers /admin/bons", async ({ page }) => {
  reads.list_reservations = () => [resa({ bons_cadeaux: [{ code: "VRC-7K2M-9QXA", offre_label: "1h duo", montant: 58, statut: "valide" }] })];
  try {
    await page.goto("/admin/reservations");
    const badge = page.locator("#reservations-body [data-bon-badge]");
    await expect(badge).toHaveText("🎁 VRC-7K2M-9QXA");
    await expect(badge).toHaveAttribute("href", "/admin/bons?q=VRC-7K2M-9QXA");
  } finally {
    reads.list_reservations = () => [resa(), resa({ id: "b2", client_nom: "Bob Martin", statut: "annulée" })];
  }
});

test("/admin/reservations : réservations du jour lues via l'API admin", async ({ page }) => {
  await page.goto("/admin/reservations");
  await expect(page.locator("#admin-table-wrap")).toBeVisible();
  await expect(page.locator("#reservations-body")).toContainText("Alice Dupont");
  await expect(page.locator("#stat-total")).toHaveText("2");
  await expect(page.locator("#stat-confirmed")).toHaveText("1");

  const [call] = dbCalls("list_reservations");
  expect(new Date(call.body.start).getTime()).toBeLessThan(new Date(call.body.end).getTime());
  expect(call.body.active_only).toBeUndefined();
});

test("/admin/reservations : erreur de l'API affichée", async ({ page }) => {
  await page.unroute("**/api/**");
  api = new FakeApi({ "/api/admin/db": () => ({ status: 500, body: { error: "boom" } }) });
  await api.install(page);
  await page.goto("/admin/reservations");
  await expect(page.locator("#admin-error")).toContainText("boom");
});

test("/admin/planning : semaine lue via l'API admin, sans les annulées", async ({ page }) => {
  await page.goto("/admin/planning");
  await expect(page.getByText("Alice Dupont").first()).toBeVisible();
  const [call] = dbCalls("list_reservations");
  expect(call.body.active_only).toBe(true);
  // Une semaine : du lundi 00:00 au dimanche 23:59
  expect(new Date(call.body.end).getTime() - new Date(call.body.start).getTime()).toBeLessThan(7 * 24 * 3600 * 1000);
});

test("/admin/clients : liste et historique d'un client via l'API admin", async ({ page }) => {
  await page.goto("/admin/clients");
  await expect(page.locator("#clients-list")).toContainText("Alice Dupont");
  await expect(page.locator("#count-tous")).toHaveText("1");
  expect(dbCalls("list_clients")).toHaveLength(1);

  await page.locator("#clients-list").getByText("Alice Dupont").click();
  await expect(page.locator("#view-detail")).toBeVisible();
  await expect.poll(() => dbCalls("client_reservations").map((c) => c.body.client_id)).toEqual([CLIENT_ID]);
  await expect(page.locator("#client-reservations")).not.toContainText("Aucune réservation");
});

test("/admin/marketing : segments calculés depuis l'API admin", async ({ page }) => {
  await page.goto("/admin/marketing");
  await expect(page.locator("#content")).toBeVisible();
  await expect(page.locator("#stat-total")).toHaveText("2");
  expect(dbCalls("marketing_reservations")).toHaveLength(1);
});

test("/admin/reservation : autocomplete client via l'API admin", async ({ page }) => {
  await page.goto("/admin/reservation");
  await chooseSlot(page);
  await page.locator("#client-nom").fill("Dup");
  const ul = page.locator("#client-nom-suggestions");
  await expect(ul).toContainText("Alice Dupont");
  expect(dbCalls("client_suggestions").at(-1)!.body).toEqual({ action: "client_suggestions", field: "nom", value: "Dup" });

  await ul.getByText("Alice Dupont").click();
  await expect(page.locator("#client-email")).toHaveValue("alice@vr-cafe.fr");
});
