// Consommation Netlify du site (plan gratuit) : appels de fonctions, temps d'exécution,
// bande passante. Lue via l'API Netlify avec un jeton personnel (NETLIFY_API_TOKEN) :
//  - GET /api/v1/sites/{site}/usage          → fonctions (invocations, runtime) du mois
//  - GET /api/v1/accounts/{compte}/bandwidth → bande passante du compte
// Utilisée par la page /admin/consommation et la fonction planifiée usage-alert.
// Au-delà de l'allocation gratuite des fonctions, Netlify passe le site au niveau payant
// (« Functions Level 1 ») : d'où les alertes avant d'y arriver.

export const DEFAULT_SITE_ID = "beb5ddd1-e665-4e27-a696-9282d704dfd6";

/** Seuils : avertissement / critique, sur l'utilisation réelle et sur la projection fin de mois. */
export const THRESHOLDS = {
  warnUsedPct: 75,
  criticalUsedPct: 90,
  warnProjectedPct: 90,
  criticalProjectedPct: 110,
  /** Avant ce délai dans le mois, la projection est trop instable pour alerter. */
  minDaysForProjection: 3,
};

/**
 * calendar-sync : cron chaque minute de 6h à 22h59 UTC (17 h) ; l'heure hors plage
 * de Paris (7h en hiver, minuit en été) est écartée par le code mais compte quand même.
 */
export const CALENDAR_SYNC_RUNS_PER_DAY = 17 * 60;

export type Level = "ok" | "warn" | "critical";
export type MetricKey = "invocations" | "runtime" | "bandwidth";

export interface Metric {
  key: MetricKey;
  label: string;
  unit: "appels" | "secondes" | "octets";
  used: number;
  included: number;
  usedPct: number;
  /** Projection linéaire à la fin de la période (null en tout début de mois). */
  projected: number | null;
  projectedPct: number | null;
  level: Level;
}

export interface UsageSummary {
  periodStart: string;
  periodEnd: string;
  elapsedDays: number;
  totalDays: number;
  metrics: Metric[];
  level: Level;
  /** Part estimée de calendar-sync dans les appels du mois complet. */
  calendarSyncMonthly: number;
}

export interface RawUsage {
  periodStart: string;
  periodEnd: string;
  invocations: { used: number; included: number };
  runtime: { used: number; included: number };
  bandwidth: { used: number; included: number } | null;
}

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

export function isUsageConfigured(): boolean {
  return Boolean(getEnv("NETLIFY_API_TOKEN"));
}

async function api<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API Netlify ${path} (${res.status}) : ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Lit la consommation brute du site et du compte. */
export async function fetchUsage(): Promise<RawUsage> {
  const token = getEnv("NETLIFY_API_TOKEN");
  if (!token) throw new Error("Variable d'environnement manquante : NETLIFY_API_TOKEN");
  const siteId = getEnv("NETLIFY_SITE_ID") || DEFAULT_SITE_ID;

  type Cap = { used?: number; included: number };
  const usage = await api<
    { type: string; account_id: string; period_start_date: string; period_end_date: string; capabilities: Record<string, Cap> }[]
  >(`/sites/${siteId}/usage`, token);
  const fn = usage.find((u) => u.type === "functions");
  if (!fn) throw new Error("API Netlify : pas de consommation « functions » pour ce site");

  let bandwidth: RawUsage["bandwidth"] = null;
  try {
    const bw = await api<{ used: number; included: number }>(`/accounts/${fn.account_id}/bandwidth`, token);
    bandwidth = { used: bw.used, included: bw.included };
  } catch (e) {
    console.error("netlify-usage : bande passante illisible", e);
  }

  return {
    periodStart: fn.period_start_date,
    periodEnd: fn.period_end_date,
    invocations: { used: fn.capabilities.invocations?.used ?? 0, included: fn.capabilities.invocations?.included ?? 0 },
    runtime: { used: fn.capabilities.runtime?.used ?? 0, included: fn.capabilities.runtime?.included ?? 0 },
    bandwidth,
  };
}

function levelOf(usedPct: number, projectedPct: number | null): Level {
  const t = THRESHOLDS;
  if (usedPct >= t.criticalUsedPct || (projectedPct ?? 0) >= t.criticalProjectedPct) return "critical";
  if (usedPct >= t.warnUsedPct || (projectedPct ?? 0) >= t.warnProjectedPct) return "warn";
  return "ok";
}

const RANK: Record<Level, number> = { ok: 0, warn: 1, critical: 2 };
export const worst = (levels: Level[]): Level => levels.reduce<Level>((a, b) => (RANK[b] > RANK[a] ? b : a), "ok");
export const isHigher = (a: Level, b: Level | undefined) => RANK[a] > RANK[b ?? "ok"];

/** Pourcentages, projection fin de période et niveau d'alerte de chaque métrique. */
export function summarizeUsage(raw: RawUsage, now = Date.now()): UsageSummary {
  const start = Date.parse(raw.periodStart);
  const end = Date.parse(raw.periodEnd);
  const totalDays = (end - start) / 86_400_000;
  const elapsedDays = Math.min(Math.max((now - start) / 86_400_000, 0), totalDays);
  const canProject = elapsedDays >= THRESHOLDS.minDaysForProjection;

  const metric = (key: MetricKey, label: string, unit: Metric["unit"], v: { used: number; included: number }): Metric => {
    const usedPct = v.included ? (v.used / v.included) * 100 : 0;
    const projected = canProject ? Math.round((v.used / elapsedDays) * totalDays) : null;
    const projectedPct = projected !== null && v.included ? (projected / v.included) * 100 : null;
    return { key, label, unit, used: v.used, included: v.included, usedPct, projected, projectedPct, level: levelOf(usedPct, projectedPct) };
  };

  const metrics = [
    metric("invocations", "Appels de fonctions", "appels", raw.invocations),
    metric("runtime", "Temps d'exécution des fonctions", "secondes", raw.runtime),
    ...(raw.bandwidth ? [metric("bandwidth", "Bande passante", "octets", raw.bandwidth)] : []),
  ];

  return {
    periodStart: raw.periodStart,
    periodEnd: raw.periodEnd,
    elapsedDays,
    totalDays,
    metrics,
    level: worst(metrics.map((m) => m.level)),
    calendarSyncMonthly: Math.round(CALENDAR_SYNC_RUNS_PER_DAY * totalDays),
  };
}

/** Valeur lisible d'une métrique (« 3 406 appels », « 29 min », « 89,1 Mo »). */
export function formatValue(value: number, unit: Metric["unit"]): string {
  const n = (x: number, d = 0) => x.toLocaleString("fr-FR", { maximumFractionDigits: d });
  if (unit === "appels") return `${n(value)} appels`;
  if (unit === "secondes") return value >= 3600 ? `${n(value / 3600, 1)} h` : `${n(value / 60)} min`;
  if (value >= 1024 ** 3) return `${n(value / 1024 ** 3, 1)} Go`;
  return `${n(value / 1024 ** 2, 1)} Mo`;
}
