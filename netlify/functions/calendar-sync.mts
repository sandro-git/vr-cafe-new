// Synchronise les réservations vers l'agenda Google « Réservation » toutes les
// minutes de 8h à minuit, heure de Paris (voir netlify/lib/reservation-calendar.ts).
// Le cron Netlify est en UTC : la plage 6h-22h UTC couvre 8h-minuit en été comme en
// hiver, et isSyncHour() écarte l'heure en trop (7h en hiver, minuit en été). Le
// premier passage de 8h rattrape tout ce qui a changé pendant la nuit.
// Fonction planifiée : pas appelable en HTTP ; en production, « Run now » depuis
// l'interface Netlify (Functions → calendar-sync) force une synchro immédiate.

import type { Config } from "@netlify/functions";
import { isSyncHour, syncReservationsCalendar } from "../lib/reservation-calendar.ts";

export default async () => {
  if (!isSyncHour()) return new Response("pause nocturne");
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
  schedule: "* 6-22 * * *",
};
