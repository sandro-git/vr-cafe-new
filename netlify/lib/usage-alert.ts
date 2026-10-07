// Alerte de consommation Netlify : email à l'admin + notification push quand une
// métrique passe en « warn » ou « critical » (voir THRESHOLDS de netlify-usage.ts).
// Une seule alerte par métrique, par niveau et par période : le dernier niveau
// signalé est gardé dans Netlify Blobs (store « usage-alerts », clé = début de période).

import Mailjet from "node-mailjet";
import { getStore } from "@netlify/blobs";
import { notifyNewReservation } from "../../src/lib/notify.ts";
import { ADMIN_EMAIL } from "./bon-cadeau-emails.ts";
import {
  fetchUsage,
  formatValue,
  isHigher,
  isUsageConfigured,
  summarizeUsage,
  type Level,
  type Metric,
  type UsageSummary,
} from "./netlify-usage.ts";

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x)} %`);
const LEVEL_TEXT: Record<Level, string> = { ok: "OK", warn: "Seuil proche", critical: "Seuil presque atteint" };
const LEVEL_COLOR: Record<Level, string> = { ok: "#16a34a", warn: "#d97706", critical: "#dc2626" };

/** Métriques dont le niveau a monté depuis la dernière alerte de la période. */
export function metricsToAlert(summary: UsageSummary, sent: Partial<Record<string, Level>>): Metric[] {
  return summary.metrics.filter((m) => m.level !== "ok" && isHigher(m.level, sent[m.key]));
}

export function usageAlertEmail(summary: UsageSummary, alerts: Metric[], siteUrl = "https://vr-cafe.fr") {
  const critical = alerts.some((m) => m.level === "critical");
  const subject = `[Netlify] ${critical ? "⚠️ Seuil presque atteint" : "Seuil proche"} : ${alerts.map((m) => m.label.toLowerCase()).join(", ")}`;
  const rows = summary.metrics
    .map(
      (m) => `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${m.label}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${formatValue(m.used, m.unit)} / ${formatValue(m.included, m.unit)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${pct(m.usedPct)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${pct(m.projectedPct)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${LEVEL_COLOR[m.level]};font-weight:bold">${LEVEL_TEXT[m.level]}</td>
</tr>`,
    )
    .join("");
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;font-size:14px;color:#111827">
<tr><td style="padding:16px 0">
  <p>La consommation Netlify du site approche de l'allocation gratuite (jour ${Math.floor(summary.elapsedDays) + 1} sur ${Math.round(summary.totalDays)} de la période).</p>
  <p>Au-delà de l'allocation des fonctions, Netlify passe le site au niveau payant.</p>
</td></tr>
<tr><td>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr style="background:#f3f4f6"><th align="left" style="padding:8px 12px">Métrique</th><th align="left" style="padding:8px 12px">Utilisé</th><th align="left" style="padding:8px 12px">%</th><th align="left" style="padding:8px 12px">Projection fin de mois</th><th align="left" style="padding:8px 12px">État</th></tr>
${rows}
</table>
</td></tr>
<tr><td style="padding:16px 0">
  <p>La synchro de l'agenda (calendar-sync) représente environ ${summary.calendarSyncMonthly.toLocaleString("fr-FR")} appels sur le mois.</p>
  <p><a href="${siteUrl.replace(/\/$/, "")}/admin/consommation" style="color:#7c3aed">Voir le détail dans l'admin</a></p>
</td></tr>
</table>`;
  return { subject, html };
}

async function sendEmail(subject: string, html: string) {
  const apiKey = getEnv("MAILJET_API_KEY");
  const apiSecret = getEnv("MAILJET_API_SECRET");
  if (!apiKey || !apiSecret) throw new Error("Variables Mailjet manquantes");
  const mailjet = new Mailjet({ apiKey, apiSecret });
  await mailjet.post("send", { version: "v3.1" }).request({
    Messages: [{
      From: { Email: getEnv("MAILJET_SENDER_EMAIL") || "contact@vr-cafe.fr", Name: "VR Café" },
      To: [{ Email: ADMIN_EMAIL, Name: "VR Café Admin" }],
      Subject: subject,
      HTMLPart: html,
    }],
  });
}

export interface AlertResult {
  skipped?: string;
  level: Level | null;
  alerted: string[];
}

export async function runUsageAlert(now = Date.now()): Promise<AlertResult> {
  if (!isUsageConfigured()) return { skipped: "NETLIFY_API_TOKEN non configuré", level: null, alerted: [] };

  const store = getStore("usage-alerts");
  let raw;
  try {
    raw = await fetchUsage();
  } catch (e) {
    // Jeton expiré ou révoqué : sans cet avis, l'alerte deviendrait muette (un email par mois)
    if (e instanceof Error && /\((401|403)\)/.test(e.message)) {
      const key = `token-error-${new Date(now).toISOString().slice(0, 7)}`;
      if (!(await store.get(key))) {
        await sendEmail(
          "[Netlify] Suivi de consommation en panne : jeton refusé",
          `<p>L'API Netlify refuse le jeton NETLIFY_API_TOKEN (expiré ou révoqué) : la consommation n'est plus surveillée.</p><p>Créer un nouveau jeton puis lancer <code>zsh scripts/set-netlify-usage-token.sh</code> et redéployer.</p>`,
        );
        await store.setJSON(key, { at: new Date(now).toISOString() });
      }
    }
    throw e;
  }
  const summary = summarizeUsage(raw, now);
  const key = summary.periodStart.replace(/[^0-9A-Za-z-]/g, "_");
  const sent = ((await store.get(key, { type: "json" })) ?? {}) as Partial<Record<string, Level>>;

  const alerts = metricsToAlert(summary, sent);
  if (!alerts.length) return { level: summary.level, alerted: [] };

  const { subject, html } = usageAlertEmail(summary, alerts, getEnv("URL"));
  await sendEmail(subject, html);
  await notifyNewReservation({
    title: alerts.some((m) => m.level === "critical") ? "⚠️ Netlify : seuil presque atteint" : "Netlify : seuil proche",
    body: alerts.map((m) => `${m.label} : ${pct(m.usedPct)} (fin de mois ≈ ${pct(m.projectedPct)})`).join(" · "),
    url: "/admin/consommation",
  }).catch((e) => console.error("usage-alert : push impossible", e));

  for (const m of alerts) sent[m.key] = m.level;
  await store.setJSON(key, sent);
  return { level: summary.level, alerted: alerts.map((m) => m.key) };
}
