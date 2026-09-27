import { expect, test } from "@playwright/test";
import { adminSessionCookie } from "./helpers/admin-session";
import { FakeApi, FakeSupabase } from "./helpers/mocks";

const avis = (over: Record<string, unknown> = {}) => ({
  id: "avis-1",
  google_review_id: "g-1",
  auteur_nom: "Alice",
  note: 5,
  commentaire: "Super soirée !",
  date_avis: "2026-09-20T10:00:00Z",
  statut: "en_attente",
  brouillon_reponse: "Merci Alice, à bientôt au VR Café !",
  erreur_publication: null,
  ...over,
});

let supabase: FakeSupabase;
let api: FakeApi;

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([await adminSessionCookie(baseURL!)]);
  supabase = new FakeSupabase({
    avis: [avis(), avis({ id: "avis-2", auteur_nom: "Bob", statut: "publie", brouillon_reponse: "Merci Bob" })],
  });
  api = new FakeApi();
  await supabase.install(page);
  await api.install(page);
  await page.goto("/admin/avis");
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
});

test.afterEach(() => {
  expect(supabase.unhandled).toEqual([]);
});

const carteAlice = (page: import("@playwright/test").Page) => page.locator("[data-avis-card='avis-1']");

test("sans session admin : redirection vers la connexion", async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL });
  await page.goto("/admin/avis");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.close();
});

test("Publier envoie le brouillon affiché (régression : « brouillon vide »)", async ({ page }) => {
  const carte = carteAlice(page);
  await carte.locator("textarea").fill("  Merci beaucoup Alice !  ");
  page.once("dialog", (d) => d.accept());
  await carte.getByRole("button", { name: "Publier" }).click();

  await expect.poll(() => api.callsTo("/api/admin/avis").length).toBe(1);
  expect(api.callsTo("/api/admin/avis")[0].body).toEqual({
    action: "publish_review_reply",
    id: "avis-1",
    texte_final: "Merci beaucoup Alice !",
  });
  await expect(page.locator("#admin-error")).toBeHidden();
});

test("Publier avec un brouillon vide : erreur, rien n'est envoyé", async ({ page }) => {
  const carte = carteAlice(page);
  await carte.locator("textarea").fill("   ");
  await carte.getByRole("button", { name: "Publier" }).click();
  await expect(page.locator("#admin-error")).toHaveText("Le brouillon ne peut pas être vide.");
  expect(api.calls).toEqual([]);
});

test("Publier puis annuler la confirmation : rien n'est envoyé", async ({ page }) => {
  page.once("dialog", (d) => d.dismiss());
  await carteAlice(page).getByRole("button", { name: "Publier" }).click();
  await page.waitForTimeout(300);
  expect(api.calls).toEqual([]);
});

test("Régénérer demande un nouveau brouillon pour cet avis", async ({ page }) => {
  await carteAlice(page).getByRole("button", { name: "Régénérer" }).click();
  await expect.poll(() => api.callsTo("/api/admin/avis")[0]?.body).toEqual({ action: "regenerate_draft", id: "avis-1" });
});

test("erreur renvoyée par l'API : message affiché", async ({ page }) => {
  await page.unroute("**/api/**");
  api = new FakeApi({ "/api/admin/avis": () => ({ status: 502, body: { error: "Google a rejeté la réponse (400)" } }) });
  await api.install(page);
  page.once("dialog", (d) => d.accept());
  await carteAlice(page).getByRole("button", { name: "Publier" }).click();
  await expect(page.locator("#admin-error")).toHaveText("Erreur : Google a rejeté la réponse (400)");
});

test("statistiques et avis publiés en lecture seule", async ({ page }) => {
  await expect(page.locator("#stat-en-attente")).toHaveText("1");
  await expect(page.locator("#stat-publie")).toHaveText("1");
  const bob = page.locator("[data-avis-card='avis-2']");
  await expect(bob.locator("textarea")).toHaveAttribute("readonly", "");
  await expect(bob.getByRole("button", { name: "Publier" })).toHaveCount(0);
});
