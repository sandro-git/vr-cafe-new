// Vérifie la consommation Netlify toutes les 6 heures et alerte l'admin (email + push)
// quand un seuil approche (voir netlify/lib/usage-alert.ts). « Run now » dans Netlify
// (Functions → usage-alert) force une vérification.

import type { Config } from "@netlify/functions";
import { runUsageAlert } from "../lib/usage-alert.ts";

export default async () => {
  try {
    const result = await runUsageAlert();
    if (result.skipped) console.log(`usage-alert : ignoré — ${result.skipped}`);
    else console.log(`usage-alert : niveau ${result.level}${result.alerted.length ? `, alerte envoyée (${result.alerted.join(", ")})` : ""}`);
  } catch (e) {
    console.error("usage-alert : échec", e);
  }
  return new Response("ok");
};

export const config: Config = {
  schedule: "0 */6 * * *",
};
