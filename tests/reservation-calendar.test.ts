import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarReservation } from "../netlify/lib/reservation-calendar";

// Faux Supabase : renvoie `rows` et mémorise les filtres de la requête
let rows: CalendarReservation[] = [];
const filters: [string, string, string][] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        gt: (c: string, v: string) => (filters.push(["gt", c, v]), q),
        lt: (c: string, v: string) => (filters.push(["lt", c, v]), q),
        order: () => Promise.resolve({ data: rows, error: null }),
      };
      return q;
    },
  }),
}));

const ENV = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh",
  PUBLIC_SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  URL: "https://vr-cafe.fr",
};

const ID = "3f2a9c1e-1111-4222-8333-444455556666";
const resa = (over: Partial<CalendarReservation> = {}): CalendarReservation => ({
  id: ID,
  statut: "confirmée",
  type_reservation: "standard",
  client_nom: "Dupont",
  client_email: "dupont@gmail.com",
  client_telephone: "+33 6 71 41 06 95",
  nb_personnes: 4,
  duree_minutes: 60,
  creneau_debut: "2026-10-10T12:00:00Z",
  creneau_fin: "2026-10-10T13:00:00Z",
  notes: null,
  reservation_boxes: [{ boxes: { nom: "Box 1", type: "sans_fil" } }, { boxes: { nom: "Box 2", type: "sans_fil" } }],
  ...over,
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

async function load() {
  vi.resetModules();
  return import("../netlify/lib/reservation-calendar");
}

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  rows = [];
  filters.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("buildEvent", () => {
  it("construit titre, description, horaires et propriétés privées", async () => {
    const { buildEvent } = await load();
    const ev = buildEvent(resa({ notes: "Gâteau à 15h" }));
    expect(ev.id).toBe("vrc3f2a9c1e111142228333444455556666");
    expect(ev.id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(ev.summary).toBe("🎮 Dupont · 4 pers. · 1h sans fil");
    expect(ev.description).toContain("Réf. #3F2A9C1E — Standard");
    expect(ev.description).toContain("Session : 1h — VR sans fil");
    expect(ev.description).toContain("Box : Box 1, Box 2");
    expect(ev.description).toContain("Téléphone : +33 6 71 41 06 95");
    expect(ev.description).toContain("Notes : Gâteau à 15h");
    expect(ev.start).toEqual({ dateTime: "2026-10-10T12:00:00.000Z", timeZone: "Europe/Paris" });
    expect(ev.end.dateTime).toBe("2026-10-10T13:00:00.000Z");
    expect(ev.extendedProperties?.private).toEqual({ source: "vr-cafe", reservation_id: ID });
    expect(ev.colorId).toBeUndefined();
  });

  it("distingue anniversaire, MDJ, no-show, filaire et box pas encore attribuées", async () => {
    const { buildEvent } = await load();
    const anniv = buildEvent(resa({ type_reservation: "anniversaire", reservation_boxes: [{ boxes: { nom: "Box 3", type: "filaire" } }] }));
    expect(anniv.summary).toBe("🎂 Dupont · 4 pers. · 1h filaire");
    expect(anniv.colorId).toBe("4");
    const mdj = buildEvent(resa({ type_reservation: "mdj", nb_personnes: 8, duree_minutes: 30, reservation_boxes: [] }));
    expect(mdj.summary).toBe("🏠 Dupont · 8 enfants · 30 min");
    expect(mdj.colorId).toBe("3");
    const noShow = buildEvent(resa({ statut: "no_show", client_nom: null }));
    expect(noShow.summary).toMatch(/^🚫 No-show · 🎮 Client/);
    expect(noShow.colorId).toBe("8");
  });
});

describe("planCalendarSync", () => {
  it("crée, met à jour seulement si le contenu change, et supprime les annulées ou disparues", async () => {
    const { planCalendarSync, buildEvent, eventHash, eventIdFor } = await load();
    const same = resa({ id: "00000000-0000-4000-8000-000000000001" });
    const changed = resa({ id: "00000000-0000-4000-8000-000000000002" });
    const fresh = resa({ id: "00000000-0000-4000-8000-000000000003" });
    const cancelled = resa({ id: "00000000-0000-4000-8000-000000000004", statut: "annulée" });

    const synced = (r: CalendarReservation, h = eventHash(buildEvent(r, ENV.URL))) => {
      const ev = buildEvent(r, ENV.URL);
      ev.extendedProperties!.private!.h = h;
      return ev;
    };
    const existing = [
      synced(same),
      synced(changed, "ancienne"),
      synced(cancelled),
      { ...synced(resa({ id: "00000000-0000-4000-8000-000000000005" })) }, // supprimée en base
    ];

    const plan = planCalendarSync([same, changed, fresh, cancelled], existing, ENV.URL);
    expect(plan.create.map((e) => e.id)).toEqual([eventIdFor(fresh.id)]);
    expect(plan.create[0].extendedProperties?.private?.h).toBe(eventHash(buildEvent(fresh, ENV.URL)));
    expect(plan.update.map((e) => e.id)).toEqual([eventIdFor(changed.id)]);
    expect(plan.delete).toEqual([eventIdFor(cancelled.id), eventIdFor("00000000-0000-4000-8000-000000000005")]);
  });

  it("l'empreinte ignore ce qui n'est pas synchronisé et suit le créneau", async () => {
    const { buildEvent, eventHash } = await load();
    const a = buildEvent(resa());
    expect(eventHash({ ...a, extendedProperties: {} })).toBe(eventHash(a));
    expect(eventHash(buildEvent(resa({ creneau_fin: "2026-10-10T13:30:00Z" })))).not.toBe(eventHash(a));
  });
});

describe("syncReservationsCalendar", () => {
  it("ne fait rien sans jeton Google Calendar", async () => {
    vi.stubEnv("GOOGLE_CALENDAR_REFRESH_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { syncReservationsCalendar } = await load();
    const res = await syncReservationsCalendar();
    expect(res.skipped).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trouve l'agenda « Réservation », applique le plan et continue après une erreur", async () => {
    const { syncReservationsCalendar, eventIdFor } = await load();
    const ok = resa({ id: "00000000-0000-4000-8000-00000000000a" });
    const ko = resa({ id: "00000000-0000-4000-8000-00000000000b" });
    const gone = eventIdFor("00000000-0000-4000-8000-00000000000c");
    rows = [ok, ko];

    const calls: { method: string; url: string; body?: any }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined });
      if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "tok", expires_in: 3600 });
      if (url.includes("/users/me/calendarList"))
        return json({ items: [{ id: "perso@gmail.com", summary: "Perso" }, { id: "resa@group.calendar.google.com", summary: "Réservation" }] });
      if (url.includes("/events?") && method === "GET")
        return json({ items: [{ id: gone, start: { dateTime: "x" }, end: { dateTime: "y" }, extendedProperties: { private: { source: "vr-cafe", h: "z" } } }] });
      if (method === "POST" && calls.at(-1)?.body?.id === eventIdFor(ko.id)) return json({ error: { message: "boom" } }, 500);
      if (method === "POST") return json({}, 200);
      if (method === "DELETE") return new Response(null, { status: 410 });
      return json({});
    }));

    const res = await syncReservationsCalendar(Date.parse("2026-10-07T10:00:00Z"));
    expect(res).toMatchObject({ created: 1, updated: 0, deleted: 1 });
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain(eventIdFor(ko.id));

    const list = calls.find((c) => c.method === "GET" && c.url.includes("/events?"))!;
    expect(list.url).toContain("/calendars/resa%40group.calendar.google.com/events");
    expect(new URL(list.url).searchParams.get("privateExtendedProperty")).toBe("source=vr-cafe");
    // Même fenêtre côté base et côté Google
    expect(filters).toEqual([
      ["gt", "creneau_fin", new URL(list.url).searchParams.get("timeMin")],
      ["lt", "creneau_debut", new URL(list.url).searchParams.get("timeMax")],
    ]);
    // Jamais d'invitation envoyée
    for (const c of calls.filter((c) => c.method !== "GET" && c.url.includes("/events"))) {
      expect(c.url).toContain("sendUpdates=none");
    }
  });

  it("remplace un événement dont l'id existe déjà (supprimé à la main dans Google)", async () => {
    const { syncReservationsCalendar, eventIdFor } = await load();
    vi.stubEnv("GOOGLE_CALENDAR_ID", "resa@group.calendar.google.com");
    rows = [resa()];
    const methods: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "tok", expires_in: 3600 });
      methods.push(`${method} ${url.includes(eventIdFor(ID)) ? "id" : ""}`.trim());
      if (method === "GET") return json({ items: [] });
      if (method === "POST") return json({ error: { message: "duplicate" } }, 409);
      return json({});
    }));
    const res = await syncReservationsCalendar();
    expect(res).toMatchObject({ created: 1, errors: [] });
    expect(methods).toEqual(["GET", "POST", "PUT id"]);
  });
});
