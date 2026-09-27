import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminSession } from "../netlify/lib/admin-session";

// Faux Supabase : enregistre les écritures sur push_subscriptions
const db = vi.hoisted(() => ({
  ops: [] as { op: string; table: string; args: unknown[] }[],
  error: null as unknown,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      upsert: async (...args: unknown[]) => { db.ops.push({ op: "upsert", table, args }); return { error: db.error }; },
      delete: () => ({
        eq: async (...args: unknown[]) => { db.ops.push({ op: "delete", table, args }); return { error: db.error }; },
      }),
    }),
  }),
}));

import handler from "../netlify/functions/push-subscribe.mts";

const ENV = { ADMIN_PASSWORD: "mdp-test", ADMIN_SESSION_SECRET: "secret-test" };
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

async function request(method: string, body: unknown, { session = true } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers.cookie = `admin_session=${encodeURIComponent((await createAdminSession(ENV))!)}`;
  const req = new Request("https://vr-cafe.fr/api/push/subscribe", {
    method,
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await handler(req, {} as any);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  db.ops.length = 0;
  db.error = null;
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.stubEnv("PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("push-subscribe", () => {
  it("POST : enregistre l'abonnement (upsert sur l'endpoint)", async () => {
    const res = await request("POST", { endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(db.ops).toEqual([
      { op: "upsert", table: "push_subscriptions", args: [{ endpoint: ENDPOINT, p256dh: "p", auth: "a" }, { onConflict: "endpoint" }] },
    ]);
  });

  it("DELETE : supprime l'abonnement de cet endpoint uniquement", async () => {
    const res = await request("DELETE", { endpoint: ENDPOINT });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(db.ops).toEqual([{ op: "delete", table: "push_subscriptions", args: ["endpoint", ENDPOINT] }]);
  });

  it("sans session admin : 401, aucune écriture", async () => {
    for (const method of ["POST", "DELETE"]) {
      const res = await request(method, { endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } }, { session: false });
      expect(res.status).toBe(401);
    }
    expect(db.ops).toEqual([]);
  });

  it("champs manquants : 400 (clés requises en POST, endpoint requis partout)", async () => {
    expect((await request("POST", { endpoint: ENDPOINT })).status).toBe(400);
    expect((await request("DELETE", {})).status).toBe(400);
    expect((await request("DELETE", "pas du json")).status).toBe(400);
    expect(db.ops).toEqual([]);
  });

  it("autre méthode : 405", async () => {
    const res = await handler(new Request("https://vr-cafe.fr/api/push/subscribe", { method: "GET" }), {} as any);
    expect(res.status).toBe(405);
  });

  it("erreur Supabase : 500", async () => {
    db.error = { message: "boom" };
    expect((await request("DELETE", { endpoint: ENDPOINT })).status).toBe(500);
    expect((await request("POST", { endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } })).status).toBe(500);
  });
});
