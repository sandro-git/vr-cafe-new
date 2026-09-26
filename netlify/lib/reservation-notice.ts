/** Préavis minimum pour annuler/modifier soi-même une réservation (liens de l'email). */
export const MIN_NOTICE_MS = 24 * 60 * 60 * 1000;

/** true si le créneau commence dans au moins 24h (auto-annulation/modification autorisée). */
export function hasMinNotice(creneauDebut: string | Date, now: number = Date.now()): boolean {
  return new Date(creneauDebut).getTime() - now >= MIN_NOTICE_MS;
}
