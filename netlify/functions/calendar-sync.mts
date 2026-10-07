// Synchronise les réservations vers l'agenda Google « Réservation » toutes les
// 5 minutes (voir netlify/lib/reservation-calendar.ts). Fonction planifiée : pas
// appelable en HTTP ; en production, « Run now » depuis l'interface Netlify
// (Functions → calendar-sync) force une synchro immédiate.

import type { Config } from "@netlify/functions";
import { syncReservationsCalendar } from "../lib/reservation-calendar.ts";

export default async () => {
  try {
    const result = await syncReservationsCalendar();
    if (result.skipped) console.log(`calendar-sync : ignoré — ${result.skipped}`);
    else if (result.created || result.updated || result.deleted || result.errors.length) {
      console.log(
        `calendar-sync : ${result.created} créé(s), ${result.updated} mis à jour, ${result.deleted} supprimé(s)`,
      );
    }
    for (const err of result.errors) console.error(`calendar-sync : ${err}`);
  } catch (e) {
    console.error("calendar-sync : échec", e);
  }
  return new Response("ok");
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
