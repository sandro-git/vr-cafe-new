import { expect, test, type Page } from "@playwright/test";
import { FakeApi } from "./helpers/mocks";

const ID = "305b8767-1234-4abc-9def-0123456789ab";
const TOKEN = "jeton+de/test=";

const reservation = (over: Record<string, unknown> = {}) => ({
  type_reservation: "standard",
  client_nom: "Sandro TEST",
  client_email: "test@vr-cafe.fr",
  client_telephone: "+33 6 71 41 06 95",
  nb_personnes: 3,
  creneau_debut: "2026-10-03T12:00:00Z",
  creneau_fin: "2026-10-03T13:00:00Z",
  ...over,
});

function lookup(body: Record<string, unknown>, status = 200) {
  return new FakeApi({
    "/api/reservation-lookup-public": () => ({ status, body }),
  });
}

async function open(page: Page, api: FakeApi, action?: string) {
  await api.install(page);
  const q = new URLSearchParams({ id: ID, token: TOKEN, ...(action ? { action } : {}) });
  await page.goto(`/reservation/annulation?${q}`);
}

const state = (page: Page, name: string) => page.locator(`[data-state='${name}']`);

test("sans id ni token : lien invalide, aucun appel", async ({ page }) => {
  const api = new FakeApi();
  await api.install(page);
  await page.goto("/reservation/annulation");
  await expect(state(page, "invalid")).toBeVisible();
  expect(api.calls).toEqual([]);
});

test("token refusé par l'API : lien invalide", async ({ page }) => {
  await open(page, lookup({ error: "Invalid token" }, 403));
  await expect(state(page, "invalid")).toBeVisible();
});

test("id et token transmis tels quels (encodage URL)", async ({ page }) => {
  const api = lookup({ ok: true, reservation: reservation(), can_cancel: true });
  await open(page, api);
  await expect(state(page, "confirm")).toBeVisible();
  const q = api.callsTo("/api/reservation-lookup-public")[0].query;
  expect([q.get("id"), q.get("token")]).toEqual([ID, TOKEN]);
});

test("déjà annulée", async ({ page }) => {
  await open(page, lookup({ ok: true, reservation: reservation(), can_cancel: false, already_cancelled: true }));
  await expect(state(page, "cancelled")).toBeVisible();
});

test("à moins de 24h : délai dépassé, numéro du café", async ({ page }) => {
  await open(page, lookup({ ok: true, reservation: reservation(), can_cancel: false }));
  await expect(state(page, "too-late")).toBeVisible();
  await expect(state(page, "too-late").getByRole("link", { name: /06 71 41 06 95/ })).toHaveAttribute("href", "tel:0671410695");
});

test("annulation : récapitulatif à l'heure de Paris, puis confirmation", async ({ page }) => {
  const api = lookup({ ok: true, reservation: reservation(), can_cancel: true });
  await open(page, api);

  const confirm = state(page, "confirm");
  await expect(confirm.locator("[data-field='nom']")).toHaveText("Sandro TEST");
  await expect(confirm.locator("[data-field='date']")).toHaveText("samedi 3 octobre 2026");
  await expect(confirm.locator("[data-field='heure']")).toHaveText("14:00 – 15:00");
  await expect(confirm.locator("[data-field='joueurs']")).toHaveText("3");

  await page.getByRole("button", { name: "Confirmer l'annulation" }).click();
  await expect(state(page, "success")).toBeVisible();
  expect(api.callsTo("/api/reservation-cancel-public")[0].body).toEqual({ id: ID, token: TOKEN });
});

test("annulation refusée par le serveur : message d'erreur, bouton réactivé", async ({ page }) => {
  const api = new FakeApi({
    "/api/reservation-lookup-public": () => ({ body: { ok: true, reservation: reservation(), can_cancel: true } }),
    "/api/reservation-cancel-public": () => ({ status: 422, body: { error: "Le délai d'annulation en ligne (24h avant le créneau) est dépassé." } }),
  });
  await open(page, api);
  const btn = page.getByRole("button", { name: "Confirmer l'annulation" });
  await btn.click();
  await expect(page.locator("#annulation-error")).toHaveText("Le délai d'annulation en ligne (24h avant le créneau) est dépassé.");
  await expect(btn).toBeEnabled();
  await expect(state(page, "success")).toBeHidden();
});

test("modifier (standard) : n'annule rien, redirige vers /reservation pré-rempli", async ({ page }) => {
  const api = lookup({ ok: true, reservation: reservation(), can_cancel: true });
  await open(page, api, "modifier");
  await expect(page.getByRole("heading", { name: "Reprogrammer ma réservation" })).toBeVisible();

  await page.getByRole("button", { name: "Choisir un nouveau créneau" }).click();
  await page.waitForURL(/\/reservation\?/);
  const q = new URL(page.url()).searchParams;
  expect(new URL(page.url()).pathname).toBe("/reservation");
  expect(Object.fromEntries(q)).toEqual({
    nom: "Sandro TEST",
    email: "test@vr-cafe.fr",
    telephone: "+33 6 71 41 06 95",
    remplace: ID,
    token: TOKEN,
  });
  expect(api.callsTo("/api/reservation-cancel-public")).toEqual([]);
});

test("modifier (anniversaire) : redirige vers /reservation-anniversaire", async ({ page }) => {
  await open(page, lookup({ ok: true, reservation: reservation({ type_reservation: "anniversaire" }), can_cancel: true }), "modifier");
  await page.getByRole("button", { name: "Choisir un nouveau créneau" }).click();
  await page.waitForURL(/\/reservation-anniversaire\?/);
});

test("modifier (MDJ) : modification par téléphone, lien d'annulation conservé", async ({ page }) => {
  await open(page, lookup({ ok: true, reservation: reservation({ type_reservation: "mdj" }), can_cancel: true }), "modifier");
  const modif = state(page, "modif-phone");
  await expect(modif).toBeVisible();
  await expect(modif.getByRole("link", { name: /06 71 41 06 95/ })).toHaveAttribute("href", "tel:0671410695");
  const href = await modif.getByRole("link", { name: "Annuler ma réservation" }).getAttribute("href");
  const q = new URL(href!, "http://x").searchParams;
  expect([q.get("id"), q.get("token"), q.get("action")]).toEqual([ID, TOKEN, null]);
});
