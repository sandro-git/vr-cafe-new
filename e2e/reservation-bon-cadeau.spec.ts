import { expect, test, type Page } from "@playwright/test";
import { FakeApi, FakeSupabase, setNow } from "./helpers/mocks";
import { chooseSlot } from "./helpers/reservation-steps";

// Champ « Bon cadeau » du formulaire de réservation : /api/bon-cadeau/verifier et
// /api/bon-cadeau/rattacher simulés. Créneau : samedi 3 octobre, 1 h (cf. chooseSlot).
const NOW = "2026-10-01T10:00:00+02:00";
const OLD_ID = "305b8767-1234-4abc-9def-0123456789ab";
const TOKEN = "jeton-test";

const BONS: Record<string, { code: string; offre_label: string; montant: number }> = {
  "VRC-7K2M-9QXA": { code: "VRC-7K2M-9QXA", offre_label: "1h duo", montant: 58 },
  "VRC-3XR4-PL2N": { code: "VRC-3XR4-PL2N", offre_label: "1h solo", montant: 29 },
};

let supabase: FakeSupabase;
let api: FakeApi;
let order: string[];

async function setup(page: Page, extra: ConstructorParameters<typeof FakeApi>[0] = {}) {
  supabase = new FakeSupabase();
  order = [];
  api = new FakeApi({
    "/api/bon-cadeau/verifier": ({ body }) => {
      const bon = BONS[body.code];
      return { body: bon ? { ok: true, bon } : { ok: false, raison: "inconnu", error: "Code inconnu. Vérifiez la saisie (ex. VRC-7K2M-9QXA)." } };
    },
    "/api/bon-cadeau/rattacher": ({ body }) => {
      order.push(`rattacher:${body.code}:${supabase.inserts.length}`);
      return { body: { ok: true, bon: BONS[body.code] } };
    },
    "/api/reservation-confirmation": () => { order.push("confirmation"); return { body: { ok: true } }; },
    "/api/reservation-cancel-public": () => { order.push("annulation"); return { body: { ok: true } }; },
    ...extra,
  });
  await setNow(page, NOW);
  await supabase.install(page);
  await api.install(page);
}

test.afterEach(() => {
  expect(supabase.unhandled).toEqual([]);
});

async function fillClient(page: Page) {
  await page.locator("#client-nom").fill("Sandro TEST");
  await page.locator("#client-email").fill("test@vr-cafe.fr");
  await page.locator("#client-telephone").fill("06 71 41 06 95");
}

test("bon appliqué : remise affichée, bon rattaché après création de la réservation et avant l'email", async ({ page }) => {
  await setup(page);
  await page.goto("/reservation");
  await chooseSlot(page, { joueurs: "4" }); // 4 × 27 € = 108 €
  await fillClient(page);

  await page.locator("#bon-code").fill("vrc 7k2m 9qxa"); // saisie à la main : remise en forme
  await page.locator("#bon-code").press("Enter"); // n'envoie pas le formulaire
  await expect(page.locator("#bon-list")).toContainText("VRC-7K2M-9QXA");
  await expect(page.locator("#bon-summary")).toContainText("108 €");
  await expect(page.locator("#bon-summary")).toContainText("−58 €");
  await expect(page.locator("#bon-reste")).toHaveText("50 €");
  expect(supabase.inserts).toEqual([]);
  expect(api.callsTo("/api/bon-cadeau/verifier")[0].body).toEqual({ code: "VRC-7K2M-9QXA" });

  await page.locator("#btn-submit").click();
  await expect(page.locator("#step-4")).toBeVisible();
  await expect(page.locator("#confirmation-reste")).toHaveText("50 €");
  await expect(page.locator("#confirmation-card")).toContainText("VRC-7K2M-9QXA");

  const id = supabase.inserts[0].body.id;
  expect(api.callsTo("/api/bon-cadeau/rattacher")[0].body).toEqual({ code: "VRC-7K2M-9QXA", reservation_id: id });
  // rattaché une fois la réservation ET ses boxes insérées, avant l'email de confirmation
  await expect.poll(() => order).toEqual(["rattacher:VRC-7K2M-9QXA:2", "confirmation"]);
});

test("plusieurs bons, retrait d'un bon, bon qui vaut plus que la session", async ({ page }) => {
  await setup(page);
  await page.goto("/reservation");
  await chooseSlot(page, { joueurs: "1" }); // 1 h solo = 29 €
  await page.locator("#bon-code").fill("VRC-7K2M-9QXA");
  await page.locator("#btn-bon-apply").click();
  await expect(page.locator("#bon-reste")).toHaveText("0 €");
  await expect(page.locator("#bon-summary")).toContainText("la différence n'est pas remboursée");

  await page.locator("#bon-code").fill("VRC-3XR4-PL2N");
  await page.locator("#btn-bon-apply").click();
  await expect(page.locator("#bon-list li")).toHaveCount(2);
  await page.getByRole("button", { name: "Retirer le bon VRC-7K2M-9QXA" }).click();
  await expect(page.locator("#bon-list li")).toHaveCount(1);
  await expect(page.locator("#bon-reste")).toHaveText("0 €");
  await expect(page.locator("#bon-summary")).not.toContainText("remboursée");
});

test("code invalide : message, et la réservation n'est pas envoyée tant que le champ n'est pas corrigé", async ({ page }) => {
  await setup(page);
  await page.goto("/reservation");
  await chooseSlot(page);
  await fillClient(page);
  await page.locator("#bon-code").fill("VRC-2222-2222");
  await page.locator("#btn-submit").click();
  await expect(page.locator("#bon-error")).toHaveText("Code inconnu. Vérifiez la saisie (ex. VRC-7K2M-9QXA).");
  await expect(page.locator("#form-error")).toContainText("bon cadeau");
  expect(supabase.inserts).toEqual([]);

  await page.locator("#bon-code").fill("");
  await page.locator("#btn-submit").click();
  await expect(page.locator("#step-4")).toBeVisible();
  expect(api.callsTo("/api/bon-cadeau/rattacher")).toEqual([]);
});

test("bon non rattaché (déjà pris entre-temps) : réservation confirmée avec un avertissement", async ({ page }) => {
  await setup(page, {
    "/api/bon-cadeau/rattacher": () => ({ status: 409, body: { ok: false, raison: "deja_reserve" } }),
  });
  await page.goto("/reservation");
  await chooseSlot(page);
  await fillClient(page);
  await page.locator("#bon-code").fill("VRC-7K2M-9QXA");
  await page.locator("#btn-bon-apply").click();
  await expect(page.locator("#bon-list li")).toHaveCount(1);
  await page.locator("#btn-submit").click();
  await expect(page.locator("#step-4")).toBeVisible();
  await expect(page.locator("#confirmation-card")).toContainText("n'a pas pu être rattaché");
  await expect(page.locator("#confirmation-reste")).toHaveCount(0);
});

test("modification : les bons de l'ancienne réservation sont repris, rattachés avant son annulation", async ({ page }) => {
  await setup(page, {
    "/api/reservation-lookup-public": () => ({
      body: { ok: true, can_cancel: true, reservation: { type_reservation: "standard", creneau_debut: "2026-10-04T12:00:00Z" }, bons_cadeaux: ["VRC-7K2M-9QXA"] },
    }),
  });
  await page.goto(`/reservation?${new URLSearchParams({ nom: "Sandro TEST", email: "test@vr-cafe.fr", telephone: "+33 6 71 41 06 95", remplace: OLD_ID, token: TOKEN })}`);
  await expect(page.locator("#bon-list")).toContainText("VRC-7K2M-9QXA");
  expect(api.callsTo("/api/bon-cadeau/verifier")[0].body).toEqual({ code: "VRC-7K2M-9QXA", remplace_id: OLD_ID, token: TOKEN });

  await chooseSlot(page);
  await page.locator("#btn-submit").click();
  await expect(page.locator("#step-4")).toBeVisible();
  expect(api.callsTo("/api/bon-cadeau/rattacher")[0].body).toMatchObject({ code: "VRC-7K2M-9QXA", remplace_id: OLD_ID, token: TOKEN });
  await expect.poll(() => order).toEqual(["rattacher:VRC-7K2M-9QXA:2", "annulation", "confirmation"]);
});
