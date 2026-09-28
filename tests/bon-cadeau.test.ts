import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Doubles : table bons_cadeaux en mémoire, Mailjet, push, API SumUp (fetch) ──
const { state, FakeMailjet } = await vi.hoisted(async () => {
  const { createMailjetMock } = await import("./helpers/mailjet-mock");
  return createMailjetMock();
});
vi.mock("node-mailjet", () => ({ default: FakeMailjet }));

const push = vi.hoisted(() => ({ calls: [] as { title: string; body: string; url: string }[] }));
vi.mock("../src/lib/notify.ts", () => ({
  notifyNewReservation: async (msg: { title: string; body: string; url: string }) => { push.calls.push(msg); },
}));

const db = vi.hoisted(() => ({ rows: new Map<string, any>(), duplicateCodes: 0 }));
vi.mock("../netlify/lib/bon-repo.ts", async (orig) => {
  const { DuplicateCodeError } = await orig<typeof import("../netlify/lib/bon-repo.ts")>();
  const repo = {
    async getById(id: string) { return db.rows.get(id) ?? null; },
    async getByCheckoutId(cid: string) { return [...db.rows.values()].find((b) => b.sumup_checkout_id === cid) ?? null; },
    async insert(bon: any) {
      if (bon.code && db.duplicateCodes > 0) { db.duplicateCodes--; throw new DuplicateCodeError("dup"); }
      const row = { code: null, sumup_checkout_id: null, sumup_transaction_code: null, paye_le: null, expire_le: null, utilise_le: null,
        email_envoye_le: null, sandbox: false, mode_paiement: "en_ligne", created_at: new Date().toISOString(), ...bon };
      db.rows.set(bon.id, row);
      return { ...row };
    },
    async update(id: string, patch: any, ifStatut?: string[]) {
      const row = db.rows.get(id);
      if (!row || (ifStatut && !ifStatut.includes(row.statut))) return null;
      if (patch.code && db.duplicateCodes > 0) { db.duplicateCodes--; throw new DuplicateCodeError("dup"); }
      Object.assign(row, patch);
      return { ...row };
    },
    async list() { return [...db.rows.values()]; },
  };
  return { DuplicateCodeError, getBonRepo: () => repo };
});

import checkout from "../netlify/functions/bon-cadeau-checkout.mts";
import statut, { maskEmail } from "../netlify/functions/bon-cadeau-statut.mts";
import webhook from "../netlify/functions/sumup-webhook.mts";
import adminBons from "../netlify/functions/admin-bons.mts";
import { createAdminSession } from "../netlify/lib/admin-session";
import { isBonCode } from "../src/lib/bons-cadeaux";

// Faux SumUp : checkouts créés, statut modifiable par le test
type Checkout = { id: string; checkout_reference: string; amount: number; currency: string; merchant_code: string; status: string;
  hosted_checkout_url: string; merchant_sandbox: boolean; transaction_code?: string; redirect_url: string; return_url?: string };
const sumup = { checkouts: new Map<string, Checkout>(), sandbox: true, fail: false, requests: [] as { method: string; url: string; auth: string | null }[] };

function fakeFetch(input: string, init: RequestInit = {}) {
  const url = String(input);
  const method = init.method ?? "GET";
  sumup.requests.push({ method, url, auth: new Headers(init.headers).get("authorization") });
  if (sumup.fail) return Promise.resolve(new Response("boom", { status: 500 }));
  if (method === "POST" && url === "https://api.sumup.com/v0.1/checkouts") {
    const b = JSON.parse(String(init.body));
    const id = `chk-${sumup.checkouts.size + 1}`;
    const c: Checkout = { id, checkout_reference: b.checkout_reference, amount: b.amount, currency: b.currency, merchant_code: b.merchant_code,
      status: "PENDING", hosted_checkout_url: `https://checkout.sumup.com/pay/c-${id}`, merchant_sandbox: sumup.sandbox,
      redirect_url: b.redirect_url, return_url: b.return_url };
    sumup.checkouts.set(id, c);
    return Promise.resolve(Response.json(c));
  }
  const m = url.match(/\/v0\.1\/checkouts\/(.+)$/);
  if (method === "GET" && m) {
    const c = sumup.checkouts.get(decodeURIComponent(m[1]));
    return Promise.resolve(c ? Response.json(c) : new Response("{}", { status: 404 }));
  }
  return Promise.resolve(new Response("unexpected", { status: 418 }));
}

const ENV = { ADMIN_PASSWORD: "mot-de-passe-test", ADMIN_SESSION_SECRET: "secret-session-test" };
const ORIGIN = "https://vr-cafe.fr";
const ACHAT = { offre: "60_duo", acheteur_nom: "Marie Curie", acheteur_email: "marie@gmail.com", beneficiaire_nom: "Léa", message: "Bon anniv !" };

beforeEach(() => {
  db.rows.clear();
  db.duplicateCodes = 0;
  push.calls.length = 0;
  state.calls.length = 0;
  state.respond = () => ({ body: {} });
  Object.assign(sumup, { checkouts: new Map(), sandbox: false, fail: false, requests: [] });
  vi.stubEnv("SUMUP_API_KEY", "sup_sk_test");
  vi.stubEnv("SUMUP_MERCHANT_CODE", "MTEST123");
  vi.stubEnv("MAILJET_API_KEY", "k");
  vi.stubEnv("MAILJET_API_SECRET", "s");
  vi.stubEnv("URL", "https://vr-cafe.fr");
  vi.stubEnv("CONTEXT", "production");
  vi.stubEnv("ADMIN_PASSWORD", ENV.ADMIN_PASSWORD);
  vi.stubEnv("ADMIN_SESSION_SECRET", ENV.ADMIN_SESSION_SECRET);
  vi.stubGlobal("Netlify", { env: { get: (k: string) => process.env[k] } });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function buy(body: Record<string, unknown> = ACHAT, origin: string | null = ORIGIN) {
  const res = await checkout(new Request("https://vr-cafe.fr/api/bon-cadeau/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  }), {} as any);
  return { status: res.status, body: await res.json() };
}
const onlyBon = () => [...db.rows.values()][0];
const pay = (status = "PAID") => {
  const c = [...sumup.checkouts.values()].at(-1)!;
  c.status = status;
  c.transaction_code = "TX123";
  return c;
};
const hook = async (id: unknown, event_type = "CHECKOUT_STATUS_CHANGED") => {
  const res = await webhook(new Request("https://vr-cafe.fr/api/sumup-webhook", { method: "POST", body: JSON.stringify({ event_type, id }) }), {} as any);
  return { status: res.status, body: await res.json() };
};
const getStatut = async (id: string) => {
  const res = await statut(new Request(`https://vr-cafe.fr/api/bon-cadeau/statut?bon=${id}`), {} as any);
  return { status: res.status, body: await res.json() };
};

describe("/api/bon-cadeau/checkout", () => {
  it("crée le bon en attente et le paiement SumUp au prix de l'offre", async () => {
    const res = await buy({ ...ACHAT, montant: 1, prix: 1 });
    expect(res.status).toBe(200);
    const bon = onlyBon();
    expect(bon).toMatchObject({ statut: "en_attente", offre: "60_duo", offre_label: "1h duo", montant: 58, code: null, sandbox: false, sumup_checkout_id: "chk-1" });
    const c = sumup.checkouts.get("chk-1")!;
    expect(c).toMatchObject({ amount: 58, currency: "EUR", merchant_code: "MTEST123", checkout_reference: bon.id });
    expect(c.redirect_url).toBe(`${ORIGIN}/cadeaux/merci?bon=${bon.id}`);
    expect(c.return_url).toBe("https://vr-cafe.fr/api/sumup-webhook");
    expect(res.body).toEqual({ url: "https://checkout.sumup.com/pay/c-chk-1" });
    expect(sumup.requests[0].auth).toBe("Bearer sup_sk_test");
  });

  it("en local : pas de webhook (SumUp ne peut pas joindre localhost), retour vers l'origine locale", async () => {
    vi.stubEnv("URL", "http://localhost:8888");
    await buy(ACHAT, "http://localhost:8888");
    const c = sumup.checkouts.get("chk-1")!;
    expect(c.return_url).toBeUndefined();
    expect(c.redirect_url).toMatch(/^http:\/\/localhost:8888\/cadeaux\/merci\?bon=/);
  });

  it("refuse une origine inconnue, le piège à robots et une saisie invalide, sans rien créer", async () => {
    expect((await buy(ACHAT, "https://evil.example")).status).toBe(403);
    expect((await buy(ACHAT, null)).status).toBe(403);
    expect((await buy({ ...ACHAT, website: "http://spam" })).status).toBe(403);
    const invalid = await buy({ ...ACHAT, offre: "gratuit", acheteur_email: "x" });
    expect(invalid.status).toBe(400);
    expect(Object.keys(invalid.body.errors).sort()).toEqual(["acheteur_email", "offre"]);
    expect(db.rows.size).toBe(0);
    expect(sumup.requests).toHaveLength(0);
  });

  it("SumUp non configuré → 503 avec le numéro du café", async () => {
    vi.stubEnv("SUMUP_API_KEY", "");
    const res = await buy();
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("06 71 41 06 95");
  });

  it("compte SumUp sandbox sur le site en production : paiement refusé, bon en échec", async () => {
    sumup.sandbox = true;
    const res = await buy();
    expect(res.status).toBe(502);
    expect(res.body.url).toBeUndefined();
    expect(onlyBon()).toMatchObject({ statut: "echec", sandbox: true });
  });

  it("compte sandbox hors production (dev, aperçus) : autorisé, bon marqué sandbox", async () => {
    sumup.sandbox = true;
    vi.stubEnv("CONTEXT", "deploy-preview");
    expect((await buy()).status).toBe(200);
    expect(onlyBon()).toMatchObject({ statut: "en_attente", sandbox: true });
  });

  it("erreur SumUp → 502 sans détail technique", async () => {
    sumup.fail = true;
    const res = await buy();
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("boom");
  });
});

describe("activation du bon (webhook SumUp et page merci)", () => {
  it("paiement confirmé par le webhook : code, validité 1 an, email au client et à l'admin, push, une seule fois", async () => {
    await buy();
    const c = pay();
    const res = await hook(c.id);
    expect(res).toEqual({ status: 200, body: { ok: true, statut: "valide" } });

    const bon = onlyBon();
    expect(isBonCode(bon.code)).toBe(true);
    expect(bon.sumup_transaction_code).toBe("TX123");
    expect(Date.parse(bon.expire_le) - Date.parse(bon.paye_le)).toBeGreaterThan(364 * 86400_000);
    expect(bon.email_envoye_le).not.toBeNull();

    const to = state.calls.map((c) => c.body.Messages[0].To[0].Email);
    expect(to).toEqual(["marie@gmail.com", "sandro@vr-cafe.fr"]);
    expect(state.calls[0].body.Messages[0].HTMLPart).toContain(bon.code);
    expect(push.calls).toEqual([{ title: "🎁 Bon cadeau vendu", body: "Marie Curie — 1h duo — 58 €", url: "/admin/bons" }]);

    // SumUp renvoie le webhook, le client revient sur la page merci : rien n'est renvoyé
    await hook(c.id);
    await getStatut(bon.id);
    expect(onlyBon().code).toBe(bon.code);
    expect(state.calls).toHaveLength(2);
    expect(push.calls).toHaveLength(1);
  });

  it("ne croit que l'API SumUp : webhook d'un paiement non payé → rien", async () => {
    await buy();
    const c = pay("PENDING");
    expect((await hook(c.id)).body.statut).toBe("en_attente");
    expect(onlyBon().code).toBeNull();
    expect(state.calls).toHaveLength(0);
  });

  it("paiement échoué ou expiré → bon en échec", async () => {
    await buy();
    const c = pay("FAILED");
    expect((await hook(c.id)).body.statut).toBe("echec");
  });

  it("montant ou marchand incohérent avec le bon → bon non activé", async () => {
    await buy();
    const c = pay();
    c.amount = 1;
    await hook(c.id);
    expect(onlyBon().statut).toBe("en_attente");
    c.amount = 58;
    c.merchant_code = "AUTRE";
    await hook(c.id);
    expect(onlyBon().statut).toBe("en_attente");
    expect(state.calls).toHaveLength(0);
  });

  it("code déjà attribué (collision) → nouveau code tiré", async () => {
    await buy();
    const c = pay();
    db.duplicateCodes = 2;
    await hook(c.id);
    expect(onlyBon().statut).toBe("valide");
  });

  it("email client en échec : bon quand même valide, email_envoye_le vide", async () => {
    state.respond = (call) => { if (call.body.Messages[0].To[0].Email === "marie@gmail.com") throw new Error("Mailjet down"); return { body: {} }; };
    await buy();
    await hook(pay().id);
    expect(onlyBon()).toMatchObject({ statut: "valide", email_envoye_le: null });
  });

  it("webhook : événement inconnu, id étranger ou invalide → ignoré (200)", async () => {
    expect((await hook("chk-x", "OTHER")).body.ignored).toBe(true);
    expect((await hook(42)).body.ignored).toBe(true);
    expect((await hook("chk-inconnu")).body.ignored).toBe(true);
  });

  it("webhook : erreur SumUp → 500 pour que SumUp retente", async () => {
    await buy();
    sumup.fail = true;
    expect((await hook("chk-1")).status).toBe(500);
  });
});

describe("/api/bon-cadeau/statut", () => {
  it("id invalide ou inconnu → 404", async () => {
    expect((await getStatut("pas-un-uuid")).status).toBe(404);
    expect((await getStatut("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("vérifie le paiement chez SumUp (retour client avant le webhook) et renvoie le code", async () => {
    await buy();
    const bon = onlyBon();
    expect((await getStatut(bon.id)).body).toEqual({
      statut: "en_attente", offre_label: "1h duo", beneficiaire_nom: "Léa", acheteur_email: "m•••@gmail.com", email_envoye: false,
    });
    pay();
    const res = (await getStatut(bon.id)).body;
    expect(res).toMatchObject({ statut: "valide", code: onlyBon().code, expire_le: onlyBon().expire_le, email_envoye: true });
  });

  it("maskEmail", () => {
    expect(maskEmail("jean.dupont@gmail.com")).toBe("j•••@gmail.com");
    expect(maskEmail(null)).toBeNull();
  });
});

describe("/api/admin/bons", () => {
  const post = async (body: unknown, auth = true) => {
    const token = auth ? await createAdminSession(ENV) : null;
    const res = await adminBons(new Request("https://vr-cafe.fr/api/admin/bons", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { cookie: `admin_session=${encodeURIComponent(token)}` } : {}) },
      body: JSON.stringify(body),
    }), {} as any);
    return { status: res.status, body: await res.json() };
  };
  async function validBon() {
    await buy();
    await hook(pay().id);
    state.calls.length = 0;
    return onlyBon();
  }

  it("sans session admin → 401", async () => {
    expect((await post({ action: "list" }, false)).status).toBe(401);
  });

  it("marquer utilisé (une seule fois), annuler l'utilisation", async () => {
    const bon = await validBon();
    const used = await post({ action: "mark_used", id: bon.id });
    expect(used.body.data).toMatchObject({ statut: "utilise" });
    expect(used.body.data.utilise_le).not.toBeNull();
    expect((await post({ action: "mark_used", id: bon.id })).status).toBe(409);
    expect((await post({ action: "unmark_used", id: bon.id })).body.data).toMatchObject({ statut: "valide", utilise_le: null });
  });

  it("un bon en attente de paiement ne peut pas être utilisé", async () => {
    await buy();
    expect((await post({ action: "mark_used", id: onlyBon().id })).status).toBe(409);
  });

  it("annuler un bon valide, renvoyer l'email", async () => {
    const bon = await validBon();
    expect((await post({ action: "resend_email", id: bon.id })).status).toBe(200);
    expect(state.calls.map((c) => c.body.Messages[0].To[0].Email)).toEqual(["marie@gmail.com"]);
    expect((await post({ action: "cancel", id: bon.id })).body.data.statut).toBe("annule");
    expect((await post({ action: "resend_email", id: bon.id })).status).toBe(409);
  });

  it("bon vendu au comptoir : valide tout de suite, email si adresse, pas de push", async () => {
    const res = await post({ action: "create_comptoir", offre: "30_solo", acheteur_nom: "Paul", acheteur_email: "paul@gmail.com", beneficiaire_nom: "Zoé" });
    expect(res.body.data).toMatchObject({ statut: "valide", mode_paiement: "comptoir", montant: 18, offre_label: "30 min solo" });
    expect(isBonCode(res.body.data.code)).toBe(true);
    expect(state.calls.map((c) => c.body.Messages[0].To[0].Email)).toEqual(["paul@gmail.com"]);
    expect(push.calls).toHaveLength(0);

    const sansEmail = await post({ action: "create_comptoir", offre: "60_solo", acheteur_nom: "Paul", beneficiaire_nom: "Zoé" });
    expect(sansEmail.body.data).toMatchObject({ acheteur_email: null, email_envoye_le: null });
    expect((await post({ action: "create_comptoir", offre: "x", acheteur_nom: "Paul", beneficiaire_nom: "Zoé" })).status).toBe(400);
  });

  it("id invalide ou action inconnue → 400", async () => {
    expect((await post({ action: "mark_used", id: "1; drop table" })).status).toBe(400);
    expect((await post({ action: "delete_all", id: "00000000-0000-4000-8000-000000000000" })).status).toBe(400);
  });
});
