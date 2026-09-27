import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Faux client Supabase : enregistre la chaîne d'appels de chaque requête
type Call = [string, ...unknown[]];
const supa = vi.hoisted(() => ({
  queries: [] as Call[][],
  result: { data: [] as unknown, error: null as { message: string } | null },
  key: "",
}));
function fakeClient() {
  const from = (table: string) => {
    const calls: Call[] = [["from", table]];
    supa.queries.push(calls);
    const q: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(supa.result);
        return (...args: unknown[]) => { calls.push([prop, ...args]); return q; };
      },
    });
    return q;
  };
  return { from } as any;
}
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => { supa.key = key; return fakeClient(); },
}));

import { runAdminRead, isAdminReadAction, ADMIN_READ_ACTIONS } from "../netlify/lib/admin-reads";
import { createAdminSession } from "../netlify/lib/admin-session";
import adminDb from "../netlify/functions/admin-db.mts";

const UUID = "a1b2c3d4-0000-4000-8000-000000000001";

beforeEach(() => {
  supa.queries.length = 0;
  supa.result = { data: [], error: null };
  supa.key = "";
});

describe("runAdminRead", () => {
  it("list_reservations : plage de dates, boxes jointes, tri par créneau", async () => {
    supa.result = { data: [{ id: UUID }], error: null };
    const r = await runAdminRead(fakeClient(), "list_reservations", {
      start: "2026-09-28T00:00:00.000Z", end: "2026-10-04T23:59:59.000Z",
    });
    expect(r).toEqual({ status: 200, body: { data: [{ id: UUID }] } });
    expect(supa.queries[0]).toEqual([
      ["from", "reservations"],
      ["select", "*, reservation_boxes ( box_id, boxes ( nom, type ) )"],
      ["gte", "creneau_debut", "2026-09-28T00:00:00.000Z"],
      ["lte", "creneau_debut", "2026-10-04T23:59:59.000Z"],
      ["order", "creneau_debut"],
    ]);
  });

  it("list_reservations : active_only exclut annulées et no-show", async () => {
    await runAdminRead(fakeClient(), "list_reservations", {
      start: "2026-09-28T00:00:00Z", end: "2026-09-29T00:00:00Z", active_only: true,
    });
    expect(supa.queries[0]).toContainEqual(["not", "statut", "in", '("annulée","no_show")']);
  });

  it("list_reservations : refuse dates invalides, inversées ou période trop longue", async () => {
    for (const body of [
      {},
      { start: "pas une date", end: "2026-09-29T00:00:00Z" },
      { start: "2026-09-29T00:00:00Z", end: "2026-09-28T00:00:00Z" },
      { start: "2020-01-01T00:00:00Z", end: "2026-09-28T00:00:00Z" },
    ]) {
      expect((await runAdminRead(fakeClient(), "list_reservations", body)).status).toBe(400);
    }
    expect(supa.queries).toHaveLength(0);
  });

  it("client_suggestions : colonne fixée côté serveur, 20 résultats max", async () => {
    await runAdminRead(fakeClient(), "client_suggestions", { field: "email", value: " dupont " });
    expect(supa.queries[0]).toEqual([
      ["from", "reservations"],
      ["select", "client_nom, client_email, client_telephone"],
      ["ilike", "client_email", "%dupont%"],
      ["order", "created_at", { ascending: false }],
      ["limit", 20],
    ]);
  });

  it("client_suggestions : champ inconnu refusé, recherche trop courte vide sans requête", async () => {
    expect((await runAdminRead(fakeClient(), "client_suggestions", { field: "notes", value: "abc" })).status).toBe(400);
    expect((await runAdminRead(fakeClient(), "client_suggestions", { field: "client_email", value: "abc" })).status).toBe(400);
    expect(await runAdminRead(fakeClient(), "client_suggestions", { field: "nom", value: "a" })).toEqual({ status: 200, body: { data: [] } });
    expect(supa.queries).toHaveLength(0);
  });

  it("list_clients : fiches + réservations minimales", async () => {
    supa.result = { data: [{ id: 1 }], error: null };
    const r = await runAdminRead(fakeClient(), "list_clients", {});
    expect(r.body).toEqual({ data: { clients: [{ id: 1 }], reservations: [{ id: 1 }] } });
    expect(supa.queries.map((q) => q[1])).toEqual([
      ["select", "id, nom, email, telephone"],
      ["select", "client_id, statut, creneau_debut"],
    ]);
  });

  it("client_reservations : exige un uuid", async () => {
    expect((await runAdminRead(fakeClient(), "client_reservations", { client_id: "1 or 1=1" })).status).toBe(400);
    await runAdminRead(fakeClient(), "client_reservations", { client_id: UUID });
    expect(supa.queries[0]).toContainEqual(["eq", "client_id", UUID]);
  });

  it("renvoie 500 avec le message en cas d'erreur Supabase", async () => {
    supa.result = { data: null, error: { message: "boom" } };
    expect(await runAdminRead(fakeClient(), "marketing_reservations", {})).toEqual({ status: 500, body: { error: "boom" } });
  });

  it("isAdminReadAction ne reconnaît que les lectures", () => {
    for (const a of ADMIN_READ_ACTIONS) expect(isAdminReadAction(a)).toBe(true);
    expect(isAdminReadAction("update_reservation")).toBe(false);
    expect(isAdminReadAction(undefined)).toBe(false);
  });
});

describe("/api/admin/db : lectures", () => {
  const ENV = { ADMIN_PASSWORD: "mot-de-passe-test", ADMIN_SESSION_SECRET: "secret-session-test" };
  beforeEach(() => {
    vi.stubEnv("ADMIN_PASSWORD", ENV.ADMIN_PASSWORD);
    vi.stubEnv("ADMIN_SESSION_SECRET", ENV.ADMIN_SESSION_SECRET);
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  });
  afterEach(() => vi.unstubAllEnvs());

  const post = (body: unknown, cookie?: string) =>
    adminDb(new Request("https://vr-cafe.fr/api/admin/db", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }), {} as any);

  it("refuse une lecture sans session admin (401), sans toucher Supabase", async () => {
    const res = await post({ action: "marketing_reservations" });
    expect(res.status).toBe(401);
    expect(supa.queries).toHaveLength(0);
  });

  it("exécute la lecture avec la service role quand la session est valide", async () => {
    supa.result = { data: [{ client_nom: "Dupont" }], error: null };
    const token = await createAdminSession(ENV);
    const res = await post({ action: "marketing_reservations" }, `admin_session=${encodeURIComponent(token!)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ client_nom: "Dupont" }] });
    expect(supa.key).toBe("service-role");
  });
});
