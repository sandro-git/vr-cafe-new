import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, FakeMailjet } = await vi.hoisted(async () => {
  const { createMailjetMock } = await import("./helpers/mailjet-mock");
  return createMailjetMock();
});
vi.mock("node-mailjet", () => ({ default: FakeMailjet }));

// Faux Netlify Blobs (mémoire) et faux push
const blobs = new Map<string, unknown>();
vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    get: async (k: string) => blobs.get(k) ?? null,
    setJSON: async (k: string, v: unknown) => void blobs.set(k, structuredClone(v)),
  }),
}));
const pushes: { title: string; body: string; url: string }[] = [];
vi.mock("../src/lib/notify.ts", () => ({
  notifyNewReservation: async (m: { title: string; body: string; url: string }) => void pushes.push(m),
}));

import {
  CALENDAR_SYNC_RUNS_PER_DAY,
  fetchUsage,
  formatValue,
  summarizeUsage,
  type RawUsage,
} from "../netlify/lib/netlify-usage";
import { metricsToAlert, runUsageAlert, usageAlertEmail } from "../netlify/lib/usage-alert";
import { isSyncHour } from "../netlify/lib/reservation-calendar";

const START = "2026-10-01T00:00:00.000-07:00";
const END = "2026-11-01T00:00:00.000-07:00";
const day = (n: number) => Date.parse(START) + n * 86_400_000;
const raw = (inv: number, runtime = 1000, bw = 100 * 1024 ** 2): RawUsage => ({
  periodStart: START,
  periodEnd: END,
  invocations: { used: inv, included: 125_000 },
  runtime: { used: runtime, included: 360_000 },
  bandwidth: { used: bw, included: 100 * 1024 ** 3 },
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// Réponse réelle de GET /sites/{id}/usage (abrégée)
const siteUsage = (used: number) => [
  {
    type: "functions",
    account_id: "acc123",
    period_start_date: START,
    period_end_date: END,
    capabilities: {
      invocations: { used, included: 125000, unit: "requests" },
      runtime: { used: 1753, included: 360000, unit: "seconds" },
    },
  },
  { type: "forms", account_id: "acc123", period_start_date: START, period_end_date: END, capabilities: {} },
];

function mockNetlifyApi(invocations: number) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer pat");
    if (url.endsWith("/usage")) return json(siteUsage(invocations));
    if (url.endsWith("/bandwidth")) return json({ used: 93431434, included: 107374182400 });
    return json({}, 404);
  }));
  return urls;
}

beforeEach(() => {
  vi.stubEnv("NETLIFY_API_TOKEN", "pat");
  vi.stubEnv("MAILJET_API_KEY", "k");
  vi.stubEnv("MAILJET_API_SECRET", "s");
  state.calls.length = 0;
  blobs.clear();
  pushes.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("summarizeUsage", () => {
  it("calcule pourcentage, projection fin de mois et niveau", () => {
    const s = summarizeUsage(raw(20_000), day(10));
    expect(Math.round(s.totalDays)).toBe(31);
    const inv = s.metrics.find((m) => m.key === "invocations")!;
    expect(inv.usedPct).toBeCloseTo(16, 0);
    expect(inv.projected).toBe(62_000);
    expect(inv.level).toBe("ok");
    expect(s.level).toBe("ok");
    expect(s.calendarSyncMonthly).toBe(CALENDAR_SYNC_RUNS_PER_DAY * 31);
  });

  it("alerte sur la projection avant que l'utilisation soit élevée", () => {
    // 40 000 au jour 10 → ~124 000 en fin de mois (99 %) : seuil proche
    expect(summarizeUsage(raw(40_000), day(10)).metrics[0].level).toBe("warn");
    // 50 000 au jour 10 → 155 000 (124 %) : critique
    expect(summarizeUsage(raw(50_000), day(10)).metrics[0].level).toBe("critical");
    // 95 % utilisé : critique quelle que soit la projection
    expect(summarizeUsage(raw(118_750), day(30)).metrics[0].level).toBe("critical");
    // 76 % en fin de mois : seuil proche
    expect(summarizeUsage(raw(95_000), day(30.9)).metrics[0].level).toBe("warn");
  });

  it("pas de projection les premiers jours (trop instable)", () => {
    const inv = summarizeUsage(raw(10_000), day(1)).metrics[0];
    expect(inv.projected).toBeNull();
    expect(inv.level).toBe("ok");
  });

  it("sans bande passante, deux métriques seulement", () => {
    expect(summarizeUsage({ ...raw(1), bandwidth: null }, day(5)).metrics.map((m) => m.key)).toEqual(["invocations", "runtime"]);
  });
});

describe("formatValue", () => {
  it("formate appels, durées et octets", () => {
    expect(formatValue(3406, "appels")).toMatch(/^3\s406 appels$/);
    expect(formatValue(1753, "secondes")).toBe("29 min");
    expect(formatValue(360000, "secondes")).toBe("100 h");
    expect(formatValue(93431434, "octets")).toBe("89,1 Mo");
    expect(formatValue(107374182400, "octets")).toBe("100 Go");
  });
});

describe("fetchUsage", () => {
  it("lit les fonctions du site puis la bande passante du compte", async () => {
    const urls = mockNetlifyApi(3406);
    const u = await fetchUsage();
    expect(urls).toEqual([
      "https://api.netlify.com/api/v1/sites/beb5ddd1-e665-4e27-a696-9282d704dfd6/usage",
      "https://api.netlify.com/api/v1/accounts/acc123/bandwidth",
    ]);
    expect(u).toEqual({
      periodStart: START,
      periodEnd: END,
      invocations: { used: 3406, included: 125000 },
      runtime: { used: 1753, included: 360000 },
      bandwidth: { used: 93431434, included: 107374182400 },
    });
  });

  it("erreur explicite si l'API refuse le jeton", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: 401, message: "Access Denied" }, 401)));
    await expect(fetchUsage()).rejects.toThrow(/401/);
  });
});

describe("alertes", () => {
  it("n'alerte que si le niveau d'une métrique a monté", () => {
    const s = summarizeUsage(raw(40_000, 300_000), day(10)); // appels warn, runtime critical
    expect(metricsToAlert(s, {}).map((m) => m.key)).toEqual(["invocations", "runtime"]);
    expect(metricsToAlert(s, { invocations: "warn", runtime: "warn" }).map((m) => m.key)).toEqual(["runtime"]);
    expect(metricsToAlert(s, { invocations: "critical", runtime: "critical" })).toEqual([]);
  });

  it("email en tableaux (pas de flexbox), sujet explicite, lien vers l'admin", () => {
    const s = summarizeUsage(raw(50_000), day(10));
    const { subject, html } = usageAlertEmail(s, metricsToAlert(s, {}), "https://vr-cafe.fr/");
    expect(subject).toBe("[Netlify] ⚠️ Seuil presque atteint : appels de fonctions");
    expect(html).not.toMatch(/display\s*:\s*flex/);
    expect(html).toContain("https://vr-cafe.fr/admin/consommation");
    expect(html).toContain("calendar-sync");
  });

  it("runUsageAlert : un seul email + push par niveau et par période", async () => {
    mockNetlifyApi(40_000);
    const first = await runUsageAlert(day(10));
    expect(first).toEqual({ level: "warn", alerted: ["invocations"] });
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].body.Messages[0].To[0].Email).toBe("sandro@vr-cafe.fr");
    expect(pushes).toHaveLength(1);
    expect(pushes[0].url).toBe("/admin/consommation");

    // Même niveau au passage suivant : rien
    expect(await runUsageAlert(day(10.25))).toEqual({ level: "warn", alerted: [] });
    expect(state.calls).toHaveLength(1);

    // Passage en critique : nouvelle alerte
    mockNetlifyApi(60_000);
    expect(await runUsageAlert(day(10.5))).toEqual({ level: "critical", alerted: ["invocations"] });
    expect(state.calls).toHaveLength(2);
    expect(pushes).toHaveLength(2);
  });

  it("jeton refusé : un seul email d'avis par mois, puis l'erreur remonte", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: 401, message: "Access Denied" }, 401)));
    await expect(runUsageAlert(day(10))).rejects.toThrow(/401/);
    await expect(runUsageAlert(day(10.25))).rejects.toThrow(/401/);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].body.Messages[0].Subject).toContain("jeton refusé");
  });

  it("ne fait rien sans jeton Netlify", async () => {
    vi.stubEnv("NETLIFY_API_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await runUsageAlert()).skipped).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isSyncHour (pause nocturne de calendar-sync)", () => {
  it("synchro de 8h à minuit heure de Paris, été comme hiver", () => {
    // Été (UTC+2)
    expect(isSyncHour(Date.parse("2026-07-01T05:59:00Z"))).toBe(false); // 7h59
    expect(isSyncHour(Date.parse("2026-07-01T06:00:00Z"))).toBe(true); // 8h00
    expect(isSyncHour(Date.parse("2026-07-01T21:59:00Z"))).toBe(true); // 23h59
    expect(isSyncHour(Date.parse("2026-07-01T22:00:00Z"))).toBe(false); // 0h00
    // Hiver (UTC+1)
    expect(isSyncHour(Date.parse("2026-12-01T06:30:00Z"))).toBe(false); // 7h30
    expect(isSyncHour(Date.parse("2026-12-01T07:00:00Z"))).toBe(true); // 8h00
    expect(isSyncHour(Date.parse("2026-12-01T22:59:00Z"))).toBe(true); // 23h59
  });
});
