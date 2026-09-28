import { expect, test } from "@playwright/test";
import { adminSessionCookie } from "./helpers/admin-session";
import { FakeApi } from "./helpers/mocks";

// /api/bon-cadeau/*, /api/admin/bons et la page de paiement SumUp sont simulés :
// aucun bon, aucun paiement, aucun email réellement créé.

const SUMUP_URL = "https://checkout.sumup.com/pay/c-e2e";
const BON_ID = "11111111-2222-4333-8444-555555555555";

test.describe("/cadeaux", () => {
  test("achat : envoie l'offre et les infos, puis redirige vers la page de paiement SumUp", async ({ page }) => {
    const api = new FakeApi({ "/api/bon-cadeau/checkout": () => ({ body: { url: SUMUP_URL } }) });
    await api.install(page);
    await page.route("https://checkout.sumup.com/**", (r) => r.fulfill({ contentType: "text/html", body: "<h1>SumUp</h1>" }));
    await page.goto("/cadeaux");

    await page.getByRole("radio", { name: "30 min duo, 36 €" }).check({ force: true });
    await expect(page.locator("#bon-total")).toHaveText("36 €");
    await page.getByLabel("Pour qui ?").fill("Léa");
    await page.getByLabel("De la part de").fill("Marie");
    await page.getByLabel("Votre email").fill("marie@gmail.com");
    await page.getByLabel(/Petit mot/).fill("Bon anniversaire !");
    await page.locator("#bon-submit").click();

    await page.waitForURL(SUMUP_URL);
    const [call] = api.callsTo("/api/bon-cadeau/checkout");
    expect(call.body).toMatchObject({
      offre: "30_duo", beneficiaire_nom: "Léa", acheteur_nom: "Marie", acheteur_email: "marie@gmail.com", message: "Bon anniversaire !", website: "",
    });
    expect(call.body.prix).toBeUndefined();
  });

  test("formulaire incomplet : erreurs affichées, focus sur le premier champ, aucun appel", async ({ page }) => {
    const api = new FakeApi();
    await api.install(page);
    await page.goto("/cadeaux");
    await page.locator("#bon-submit").click();
    await expect(page.locator("#err-beneficiaire_nom")).toBeVisible();
    await expect(page.locator("#err-acheteur_email")).toBeVisible();
    await expect(page.getByLabel("Pour qui ?")).toBeFocused();
    expect(api.callsTo("/api/bon-cadeau/checkout")).toHaveLength(0);
  });

  test("vente indisponible : message du serveur affiché, bouton réactivé", async ({ page }) => {
    const api = new FakeApi({
      "/api/bon-cadeau/checkout": () => ({ status: 503, body: { error: "La vente en ligne est momentanément indisponible." } }),
    });
    await api.install(page);
    await page.goto("/cadeaux");
    await page.getByLabel("Pour qui ?").fill("Léa");
    await page.getByLabel("De la part de").fill("Marie");
    await page.getByLabel("Votre email").fill("marie@gmail.com");
    await page.locator("#bon-submit").click();
    await expect(page.locator("#bon-error")).toHaveText("La vente en ligne est momentanément indisponible.");
    await expect(page.locator("#bon-submit")).toBeEnabled();
  });
});

test.describe("/cadeaux/merci", () => {
  test("paiement confirmé après une vérification en attente : affiche le code", async ({ page }) => {
    let n = 0;
    const api = new FakeApi({
      "/api/bon-cadeau/statut": () => ({
        body: ++n === 1
          ? { statut: "en_attente", offre_label: "1h duo", beneficiaire_nom: "Léa" }
          : { statut: "valide", offre_label: "1h duo", beneficiaire_nom: "Léa", code: "VRC-7K2M-9QXA", expire_le: "2027-09-28T18:30:00Z", acheteur_email: "m•••@gmail.com", email_envoye: true },
      }),
    });
    await api.install(page);
    await page.goto(`/cadeaux/merci?bon=${BON_ID}`);
    await expect(page.locator("#bon-code")).toHaveText("VRC-7K2M-9QXA");
    await expect(page.locator("#bon-expire")).toHaveText("28 septembre 2027");
    await expect(page.locator("#bon-email")).toContainText("m•••@gmail.com");
    expect(api.callsTo("/api/bon-cadeau/statut")[0].query.get("bon")).toBe(BON_ID);
  });

  test("paiement échoué ou lien invalide", async ({ page }) => {
    const api = new FakeApi({ "/api/bon-cadeau/statut": () => ({ body: { statut: "echec" } }) });
    await api.install(page);
    await page.goto(`/cadeaux/merci?bon=${BON_ID}`);
    await expect(page.getByRole("heading", { name: "Le paiement n'a pas abouti" })).toBeVisible();
    await page.goto("/cadeaux/merci");
    await expect(page.getByRole("heading", { name: "Le paiement n'a pas abouti" })).toBeVisible();
  });
});

test.describe("/admin/bons", () => {
  const future = "2099-01-01T00:00:00Z";
  const bon = (over: Record<string, unknown>) => ({
    id: BON_ID, code: "VRC-7K2M-9QXA", offre_label: "1h duo", montant: 58, acheteur_nom: "Marie", acheteur_email: "marie@gmail.com",
    beneficiaire_nom: "Léa", message: null, statut: "valide", mode_paiement: "en_ligne", sandbox: false,
    paye_le: new Date().toISOString(), expire_le: future, utilise_le: null, email_envoye_le: "2026-09-28T18:31:00Z", created_at: "2026-09-28T18:30:00Z",
    ...over,
  });
  const BONS = [
    bon({}),
    bon({ id: "22222222-2222-4333-8444-555555555555", code: "VRC-UUUU-2222", beneficiaire_nom: "Tom", statut: "utilise", utilise_le: "2026-09-29T15:00:00Z" }),
    bon({ id: "33333333-2222-4333-8444-555555555555", code: "VRC-EXPI-3333", beneficiaire_nom: "Zoé", expire_le: "2020-01-01T00:00:00Z" }),
    bon({ id: "44444444-2222-4333-8444-555555555555", code: null, beneficiaire_nom: "Attente", statut: "en_attente", paye_le: null, expire_le: null }),
  ];

  let api: FakeApi;
  test.beforeEach(async ({ page, context, baseURL }) => {
    await context.addCookies([await adminSessionCookie(baseURL!)]);
    api = new FakeApi({
      "/api/admin/bons": ({ body }) => {
        if (body.action === "list") return { body: { data: BONS } };
        if (body.action === "mark_used") return { body: { data: { ...BONS.find((b) => b.id === body.id), statut: "utilise", utilise_le: new Date().toISOString() } } };
        if (body.action === "create_comptoir")
          return { body: { data: bon({ id: "55555555-2222-4333-8444-555555555555", code: "VRC-CPTR-5555", mode_paiement: "comptoir", beneficiaire_nom: body.beneficiaire_nom, acheteur_email: null, email_envoye_le: null }) } };
        return { status: 400, body: { error: "inattendu" } };
      },
    });
    await api.install(page);
    await page.goto("/admin/bons");
    await expect(page.locator("[data-bon]").first()).toBeVisible();
  });

  test("par défaut : bons à utiliser (valides + expirés), stats", async ({ page }) => {
    await expect(page.locator("[data-bon]")).toHaveCount(2);
    await expect(page.locator(`[data-bon='${BON_ID}']`)).toContainText("Valide");
    await expect(page.getByText("Expiré", { exact: true })).toBeVisible();
    await expect(page.locator("#stat-valides")).toHaveText("1");
    await page.getByRole("button", { name: "Tous" }).click();
    await expect(page.locator("[data-bon]")).toHaveCount(4);
  });

  test("recherche par code saisi à la main, sur tous les bons", async ({ page }) => {
    await page.locator("#search").fill("vrc uuuu 2222");
    await expect(page.locator("[data-bon]")).toHaveCount(1);
    await expect(page.locator("[data-bon]")).toContainText("Tom");
  });

  test("marquer comme utilisé", async ({ page }) => {
    await page.locator(`[data-bon='${BON_ID}']`).getByRole("button", { name: /Marquer comme utilisé/ }).click();
    await expect(page.locator(`[data-bon='${BON_ID}']`)).toHaveCount(0); // quitte la liste « à utiliser »
    expect(api.callsTo("/api/admin/bons").at(-1)!.body).toEqual({ action: "mark_used", id: BON_ID });
    await page.getByRole("button", { name: "Utilisés" }).click();
    await expect(page.locator(`[data-bon='${BON_ID}']`)).toContainText("Utilisé");
  });

  test("bon expiré : confirmation demandée avant de le marquer utilisé", async ({ page }) => {
    page.once("dialog", (d) => d.dismiss());
    await page.locator("[data-bon='33333333-2222-4333-8444-555555555555']").getByRole("button", { name: /Marquer/ }).click();
    expect(api.callsTo("/api/admin/bons").filter((c) => c.body.action === "mark_used")).toHaveLength(0);
  });

  test("créer un bon vendu au comptoir", async ({ page }) => {
    await page.getByRole("button", { name: "+ Bon vendu au comptoir" }).click();
    await page.locator("#form-new select").selectOption("30_solo");
    await page.locator('#form-new [name="beneficiaire_nom"]').fill("Nina");
    await page.locator('#form-new [name="acheteur_nom"]').fill("Paul");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Créer le bon" }).click();
    await expect(page.locator("#modal-new")).toBeHidden();
    await expect(page.getByText("VRC-CPTR-5555")).toBeVisible();
    expect(api.callsTo("/api/admin/bons").at(-1)!.body).toMatchObject({ action: "create_comptoir", offre: "30_solo", beneficiaire_nom: "Nina", acheteur_nom: "Paul" });
  });
});
