import { expect, test, type Page } from "@playwright/test";
import { FakeApi, FakeSupabase, setNow } from "./helpers/mocks";
import { chooseSlot } from "./helpers/reservation-steps";

// « Maintenant » : jeudi 1er octobre 2026, 10:00 à Paris. Le samedi 3 est un jour d'ouverture.
const NOW = "2026-10-01T10:00:00+02:00";
const OLD_ID = "305b8767-1234-4abc-9def-0123456789ab";
const TOKEN = "jeton-test";

let supabase: FakeSupabase;
let api: FakeApi;

async function setup(page: Page, opts: { supabase?: ConstructorParameters<typeof FakeSupabase>[0]; api?: FakeApi } = {}) {
  supabase = new FakeSupabase(opts.supabase);
  api = opts.api ?? new FakeApi();
  await setNow(page, NOW);
  await supabase.install(page);
  await api.install(page);
}

test.afterEach(() => {
  expect(supabase.unhandled).toEqual([]);
});

async function fillClient(page: Page, { nom = "Sandro TEST", email = "test@vr-cafe.fr", tel = "06 71 41 06 95" } = {}) {
  await page.locator("#client-nom").fill(nom);
  await page.locator("#client-email").fill(email);
  await page.locator("#client-telephone").fill(tel);
}

test("réservation complète : base, montant, email de confirmation", async ({ page }) => {
  await setup(page);
  await page.goto("/reservation");
  await chooseSlot(page);
  await expect(page.locator("#step3-summary")).toContainText("samedi 3 octobre 2026");
  await expect(page.locator("#step3-summary")).toContainText("15:00 → 16:00");

  await fillClient(page);
  await page.locator("#client-notes").fill("Anniversaire de Léa");
  await page.locator("#btn-submit").click();

  await expect(page.locator("#step-4")).toBeVisible();
  const [resa, boxes] = supabase.inserts;
  // L'id est généré par le navigateur (l'insert anon ne peut pas le relire)
  const id: string = resa.body.id;
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const ref = id.split("-")[0].toUpperCase();

  const card = page.locator("#confirmation-card");
  await expect(card).toContainText(`#${ref}`);
  await expect(card).toContainText("Montant total");
  await expect(card).toContainText("81 €"); // 3 joueurs × 27 € (1 h)
  await expect(card).toContainText("Box 1, Box 2, Box 3");

  expect(resa.table).toBe("reservations");
  expect(resa.body).toMatchObject({
    client_nom: "Sandro TEST",
    client_email: "test@vr-cafe.fr",
    client_telephone: "+33 6 71 41 06 95",
    nb_personnes: 3,
    duree_minutes: 60,
    creneau_debut: "2026-10-03T13:00:00.000Z",
    creneau_fin: "2026-10-03T14:00:00.000Z",
    creneau_fin_blocage: "2026-10-03T14:30:00.000Z",
    statut: "confirmée",
    notes: "Anniversaire de Léa",
  });
  expect(boxes.table).toBe("reservation_boxes");
  expect(boxes.body.map((b: any) => b.box_id)).toEqual([1, 2, 3]);
  expect(boxes.body.every((b: any) => b.reservation_id === id)).toBe(true);

  await expect.poll(() => api.callsTo("/api/reservation-confirmation").length).toBe(1);
  expect(api.callsTo("/api/reservation-confirmation")[0].body).toMatchObject({
    id,
    ref,
    vr_type: "filaire",
    box_names: "Box 1, Box 2, Box 3",
    remplace_id: null,
  });
  // Notification admin : uniquement l'id, le texte est construit côté serveur
  await expect.poll(() => api.callsTo("/api/push-notify").length).toBe(1);
  expect(api.callsTo("/api/push-notify")[0].body).toEqual({ id });
  expect(api.callsTo("/api/reservation-cancel-public")).toEqual([]);
});

test("créneaux : 14:00 à 18:30 (1 h + 30 min de battement avant 20:00), type VR transmis", async ({ page }) => {
  await setup(page);
  await page.goto("/reservation");
  await chooseSlot(page);
  await page.locator("#btn-back-2").click();
  const heures = await page.locator("#slots-grid button span:first-child").allTextContents();
  expect(heures).toEqual(["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30"]);
  expect(new Set(supabase.rpcCalls.map((c) => c.body.p_vr_type))).toEqual(new Set(["filaire"]));
});

test("pas assez de box libres pour le groupe : aucun créneau proposé", async ({ page }) => {
  await setup(page, { supabase: { boxes: [{ box_id: 1, box_nom: "Box 1" }, { box_id: 2, box_nom: "Box 2" }] } });
  await page.goto("/reservation");
  await page.locator("#dp-trigger").click();
  await page.locator("#dp-grid button:not([disabled])", { hasText: /^3$/ }).click();
  await page.locator("#nb-personnes-grid").getByRole("button", { name: "3", exact: true }).click();
  await page.locator("#vr-type-grid").getByRole("button", { name: /VR Filaire/ }).click();
  await page.locator("#durees-list").getByRole("button", { name: "1 h" }).click();
  await page.locator("#btn-search").click();
  await expect(page.locator("#slots-empty")).toBeVisible();
});

test("réseau lent : une date choisie avant la fin du chargement est bien prise en compte", async ({ page }) => {
  await setup(page, { supabase: { delayMs: 1_500 } });
  await page.goto("/reservation");
  await page.locator("#dp-trigger").click();
  await page.locator("#dp-grid button:not([disabled])", { hasText: /^3$/ }).click(); // avant l'arrivée de la config
  await page.locator("#nb-personnes-grid").getByRole("button", { name: "3", exact: true }).click();
  await page.locator("#vr-type-grid").getByRole("button", { name: /VR Filaire/ }).click();
  await page.locator("#durees-list").getByRole("button", { name: "1 h" }).click();
  await expect(page.locator("#dp-display")).toHaveText("samedi 3 octobre 2026");
  await expect(page.locator("#btn-search")).toBeEnabled();
});

test("réseau lent : une date choisie trop tôt puis déclarée fermée est effacée", async ({ page }) => {
  await setup(page, { supabase: { delayMs: 1_500, joursFermeture: [{ date: "2026-10-03" }] } });
  await page.goto("/reservation");
  await page.locator("#dp-trigger").click();
  await page.locator("#dp-grid button:not([disabled])", { hasText: /^3$/ }).click(); // samedi, fermé exceptionnellement
  await page.locator("#durees-list").getByRole("button", { name: "1 h" }).waitFor(); // config arrivée
  await expect(page.locator("#dp-display")).toHaveText("Sélectionnez une date");
  await page.locator("#nb-personnes-grid").getByRole("button", { name: "3", exact: true }).click();
  await page.locator("#vr-type-grid").getByRole("button", { name: /VR Filaire/ }).click();
  await page.locator("#durees-list").getByRole("button", { name: "1 h" }).click();
  await expect(page.locator("#btn-search")).toBeDisabled();
});

test("jours fermés : grisés dans le calendrier", async ({ page }) => {
  await setup(page, { supabase: { joursFermeture: [{ date: "2026-10-03" }] } });
  await page.goto("/reservation");
  await page.locator("#dp-trigger").click();
  await expect(page.locator("#dp-grid button", { hasText: /^3$/ })).toBeDisabled(); // samedi fermé exceptionnellement
  await expect(page.locator("#dp-grid button", { hasText: /^1$/ })).toBeDisabled(); // jeudi : fermé hors vacances
  await expect(page.locator("#dp-grid button", { hasText: /^4$/ })).toBeEnabled(); // dimanche
});

for (const [cas, client, message] of [
  ["faux numéro", { tel: "07 12 34 56 78" }, "Merci de renseigner votre vrai numéro de téléphone."],
  ["numéro invalide", { tel: "06 71 41" }, "Numéro de téléphone invalide pour le pays sélectionné."],
  ["faux email", { email: "jean@example.com" }, "Merci de renseigner une vraie adresse email."],
  ["email manquant", { email: "" }, "Veuillez remplir tous les champs obligatoires."],
] as const) {
  test(`validation : ${cas} refusé, rien n'est enregistré`, async ({ page }) => {
    await setup(page);
    await page.goto("/reservation");
    await chooseSlot(page);
    await fillClient(page, client);
    await page.locator("#btn-submit").click();
    await expect(page.locator("#form-error")).toHaveText(message);
    expect(supabase.inserts).toEqual([]);
    expect(api.callsTo("/api/reservation-confirmation")).toEqual([]);
  });
}

const lookupStandard = (over: Record<string, unknown> = {}) => ({
  "/api/reservation-lookup-public": () => ({
    body: {
      ok: true,
      can_cancel: true,
      reservation: { type_reservation: "standard", creneau_debut: "2026-10-04T12:00:00Z", ...over },
    },
  }),
});
const modifUrl = `/reservation?${new URLSearchParams({
  nom: "Sandro TEST",
  email: "test@vr-cafe.fr",
  telephone: "+33 6 71 41 06 95",
  remplace: OLD_ID,
  token: TOKEN,
})}`;

test("modification : l'ancienne réservation n'est annulée qu'après création de la nouvelle", async ({ page }) => {
  let insertsAuMomentDeLAnnulation = -1;
  await setup(page, {
    api: new FakeApi({
      ...lookupStandard(),
      "/api/reservation-cancel-public": () => {
        insertsAuMomentDeLAnnulation = supabase.inserts.length;
        return { body: { ok: true } };
      },
    }),
  });
  await page.goto(modifUrl);

  await expect(page.locator("#replace-note")).toContainText("#305B8767");
  await expect(page.locator("#replace-note")).toContainText("dimanche 4 octobre à 14:00");
  await expect(page.locator("#client-nom")).toHaveValue("Sandro TEST");
  await expect(page.locator("#client-telephone")).toHaveValue("+33 6 71 41 06 95");

  await chooseSlot(page);
  await page.locator("#btn-submit").click();
  await expect(page.locator("#step-4")).toBeVisible();

  expect(insertsAuMomentDeLAnnulation).toBe(2); // réservation + box déjà créées
  expect(api.callsTo("/api/reservation-cancel-public")[0].body).toEqual({ id: OLD_ID, token: TOKEN, motif: "modification" });
  await expect(page.locator("#confirmation-card")).toContainText("Votre ancienne réservation #305B8767 a été annulée.");
  await expect.poll(() => api.callsTo("/api/reservation-confirmation")[0]?.body.remplace_id).toBe(OLD_ID);
});

test("modification : échec de l'annulation de l'ancienne → avertissement, pas de remplace_id", async ({ page }) => {
  await setup(page, {
    api: new FakeApi({ ...lookupStandard(), "/api/reservation-cancel-public": () => ({ status: 422, body: { error: "trop tard" } }) }),
  });
  await page.goto(modifUrl);
  await expect(page.locator("#replace-note")).toBeVisible();
  await chooseSlot(page);
  await page.locator("#btn-submit").click();
  await expect(page.locator("#confirmation-card")).toContainText("Nous n'avons pas pu annuler votre ancienne réservation #305B8767");
  await expect.poll(() => api.callsTo("/api/reservation-confirmation").length).toBe(1);
  expect(api.callsTo("/api/reservation-confirmation")[0].body.remplace_id).toBeNull();
});

test("modification d'une réservation anniversaire depuis le formulaire standard : ignorée", async ({ page }) => {
  await setup(page, { api: new FakeApi(lookupStandard({ type_reservation: "anniversaire" })) });
  await page.goto(modifUrl);
  await expect.poll(() => api.callsTo("/api/reservation-lookup-public").length).toBe(1);
  await expect(page.locator("#replace-note")).toBeHidden();
  await chooseSlot(page);
  await page.locator("#btn-submit").click();
  await expect(page.locator("#step-4")).toBeVisible();
  expect(api.callsTo("/api/reservation-cancel-public")).toEqual([]);
});
