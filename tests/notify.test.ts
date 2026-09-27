import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({
  vapid: undefined as unknown[] | undefined,
  sent: [] as { sub: any; payload: string }[],
  failFor: {} as Record<string, number>,
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => { push.vapid = args; },
    sendNotification: async (sub: any, payload: string) => {
      const status = push.failFor[sub.endpoint];
      if (status) throw Object.assign(new Error("push failed"), { statusCode: status });
      push.sent.push({ sub, payload });
    },
  },
}));

const db = vi.hoisted(() => ({
  subscriptions: [] as any[] | null,
  error: null as unknown,
  deleted: [] as unknown[],
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: async () => ({ data: db.subscriptions, error: db.error }),
      delete: () => ({ eq: async (_col: string, val: unknown) => { db.deleted.push(val); return {}; } }),
    }),
  }),
}));

import { notifyNewReservation } from "../src/lib/notify";

const msg = { title: "Nouvelle réservation", body: "Sandro · 14:00", url: "/admin/planning" };
const sub = (endpoint: string) => ({ endpoint, p256dh: `p-${endpoint}`, auth: `a-${endpoint}` });

beforeEach(() => {
  push.vapid = undefined;
  push.sent.length = 0;
  push.failFor = {};
  db.subscriptions = [sub("e1"), sub("e2")];
  db.error = null;
  db.deleted.length = 0;
  vi.stubEnv("PUBLIC_VAPID_KEY", "pub");
  vi.stubEnv("PRIVATE_VAPID_KEY", "priv");
  vi.stubEnv("VAPID_EMAIL", "mailto:sandro@vr-cafe.fr");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("notifyNewReservation", () => {
  it("clés VAPID manquantes : rien n'est envoyé", async () => {
    vi.stubEnv("PRIVATE_VAPID_KEY", "");
    await notifyNewReservation(msg);
    expect(push.vapid).toBeUndefined();
    expect(push.sent).toHaveLength(0);
  });

  it("envoie la notification à chaque abonnement admin", async () => {
    await notifyNewReservation(msg);
    expect(push.vapid).toEqual(["mailto:sandro@vr-cafe.fr", "pub", "priv"]);
    expect(push.sent.map((s) => s.sub)).toEqual([
      { endpoint: "e1", keys: { p256dh: "p-e1", auth: "a-e1" } },
      { endpoint: "e2", keys: { p256dh: "p-e2", auth: "a-e2" } },
    ]);
    expect(JSON.parse(push.sent[0].payload)).toEqual(msg);
  });

  it("aucun abonnement ou erreur Supabase : rien n'est envoyé", async () => {
    db.subscriptions = [];
    await notifyNewReservation(msg);
    db.subscriptions = null;
    db.error = { message: "boom" };
    await notifyNewReservation(msg);
    expect(push.sent).toHaveLength(0);
  });

  it("abonnement expiré (410/404) : supprimé de la base, les autres reçoivent quand même", async () => {
    db.subscriptions = [sub("gone"), sub("missing"), sub("ok")];
    push.failFor = { gone: 410, missing: 404 };
    await notifyNewReservation(msg);
    expect(db.deleted.sort()).toEqual(["gone", "missing"]);
    expect(push.sent.map((s) => s.sub.endpoint)).toEqual(["ok"]);
  });

  it("autre erreur d'envoi : journalisée, abonnement conservé", async () => {
    push.failFor = { e1: 500 };
    await notifyNewReservation(msg);
    expect(db.deleted).toHaveLength(0);
    expect(console.error).toHaveBeenCalledWith("Push send error:", expect.any(Error));
    expect(push.sent.map((s) => s.sub.endpoint)).toEqual(["e2"]);
  });
});
