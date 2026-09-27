import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as { title: string; body: string; url: string }[]);
vi.mock("../src/lib/notify.ts", () => ({
  notifyNewReservation: async (msg: { title: string; body: string; url: string }) => { sent.push(msg); },
}));

// Faux client Supabase : enregistre la requête UPDATE et simule le WHERE en mémoire
const db = vi.hoisted(() => ({
  rows: [] as any[],
  error: null as unknown,
  lastUpdate: null as null | { table: string; values: any; filters: [string, string, unknown][]; columns: string },
  clientKey: "" as string,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => {
    db.clientKey = key;
    return {
      from: (table: string) => ({
        update: (values: any) => {
          const q = { table, values, filters: [] as [string, string, unknown][], columns: "" };
          db.lastUpdate = q;
          const chain: any = {
            eq: (c: string, v: unknown) => (q.filters.push(["eq", c, v]), chain),
            is: (c: string, v: unknown) => (q.filters.push(["is", c, v]), chain),
            gt: (c: string, v: unknown) => (q.filters.push(["gt", c, v]), chain),
            select: (cols: string) => ((q.columns = cols), chain),
            maybeSingle: async () => {
              if (db.error) return { data: null, error: db.error };
              const match = db.rows.find((r) =>
                q.filters.every(([op, c, v]) =>
                  op === "eq" ? r[c] === v : op === "is" ? r[c] === v : String(r[c]) > String(v),
                ),
              );
              if (match) Object.assign(match, values);
              return { data: match ?? null, error: null };
            },
          };
          return chain;
        },
      }),
    };
  },
}));

import { notifyReservationOnce, reservationPushMessage, PUSH_WINDOW_MINUTES } from "../netlify/lib/reservation-push";

const NOW = Date.UTC(2026, 9, 1, 8, 0, 0); // 1er oct. 2026, 10:00 à Paris
const ID = "305b8767-1234-4abc-9def-0123456789ab";
const resa = (over: Record<string, unknown> = {}) => ({
  id: ID,
  created_at: new Date(NOW - 60_000).toISOString(),
  push_notifie_le: null,
  client_nom: "Alice",
  nb_personnes: 4,
  creneau_debut: "2026-10-03T12:30:00Z", // 14:30 à Paris
  type_reservation: "standard",
  ...over,
});

beforeEach(() => {
  sent.length = 0;
  db.rows = [resa()];
  db.error = null;
  db.lastUpdate = null;
  vi.stubEnv("PUBLIC_SUPABASE_URL", "http://supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("reservationPushMessage", () => {
  it("standard, anniversaire, MDJ — heure de Paris", () => {
    expect(reservationPushMessage(resa())).toEqual({
      title: "Nouvelle réservation 🎮",
      body: "Alice — 4 pers. — 14:30",
      url: "/admin/reservations",
    });
    expect(reservationPushMessage(resa({ type_reservation: "anniversaire" })).title).toBe("🎂 Réservation anniversaire");
    const mdj = reservationPushMessage(resa({ type_reservation: "mdj", nb_personnes: 8 }));
    expect(mdj.title).toBe("🏠 Réservation MDJ");
    expect(mdj.body).toBe("Alice — 8 enfants — 14:30");
  });
});

describe("notifyReservationOnce", () => {
  it("réservation récente : une notification construite depuis la base, avec la clé service role", async () => {
    expect(await notifyReservationOnce(ID, NOW)).toBe(true);
    expect(sent).toEqual([reservationPushMessage(resa())]);
    expect(db.clientKey).toBe("service-role");
    expect(db.lastUpdate?.table).toBe("reservations");
    expect(db.lastUpdate?.values).toEqual({ push_notifie_le: new Date(NOW).toISOString() });
    expect(db.lastUpdate?.filters).toContainEqual(["is", "push_notifie_le", null]);
  });

  it("une seule notification par réservation", async () => {
    expect(await notifyReservationOnce(ID, NOW)).toBe(true);
    expect(await notifyReservationOnce(ID, NOW + 1000)).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it(`réservation de plus de ${PUSH_WINDOW_MINUTES} min : rien`, async () => {
    db.rows = [resa({ created_at: new Date(NOW - (PUSH_WINDOW_MINUTES + 1) * 60_000).toISOString() })];
    expect(await notifyReservationOnce(ID, NOW)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("id inconnu ou invalide : rien, sans requête pour un id mal formé", async () => {
    expect(await notifyReservationOnce("11111111-2222-4333-8444-555555555555", NOW)).toBe(false);
    db.lastUpdate = null;
    for (const bad of [undefined, null, 42, "", "abc", `${ID}' or 1=1`, { id: ID }]) {
      expect(await notifyReservationOnce(bad, NOW)).toBe(false);
    }
    expect(db.lastUpdate).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("erreur Supabase ou variables manquantes : rien n'est envoyé", async () => {
    db.error = { message: "boom" };
    expect(await notifyReservationOnce(ID, NOW)).toBe(false);
    db.error = null;
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await notifyReservationOnce(ID, NOW)).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
