// Notification push admin d'une nouvelle réservation, déclenchée par /api/push-notify
// (formulaires publics) et par le serveur MCP. L'appelant ne fournit que l'id : le texte
// est construit ici depuis la base, et la colonne `push_notifie_le` est marquée de façon
// atomique avant l'envoi → au plus une notification par réservation, et seulement pour
// une réservation créée il y a moins de PUSH_WINDOW_MINUTES.

import { createClient } from "@supabase/supabase-js";
import { notifyNewReservation } from "../../src/lib/notify.ts";

export const PUSH_WINDOW_MINUTES = 10;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PushReservation {
  client_nom: string | null;
  nb_personnes: number | null;
  creneau_debut: string;
  type_reservation: string | null;
}

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

/** Titre et texte de la notification (heure de Paris, quel que soit le fuseau du serveur). */
export function reservationPushMessage(r: PushReservation) {
  const heure = new Date(r.creneau_debut).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  const nom = r.client_nom ?? "Client";
  const title =
    r.type_reservation === "anniversaire" ? "🎂 Réservation anniversaire"
    : r.type_reservation === "mdj" ? "🏠 Réservation MDJ"
    : "Nouvelle réservation 🎮";
  const unite = r.type_reservation === "mdj" ? "enfants" : "pers.";
  return { title, body: `${nom} — ${r.nb_personnes ?? "?"} ${unite} — ${heure}`, url: "/admin/reservations" };
}

/**
 * Réserve la notification de la réservation `id` (UPDATE atomique) puis l'envoie.
 * Renvoie false si l'id est invalide, inconnu, trop ancien ou déjà notifié.
 */
export async function notifyReservationOnce(id: unknown, now = Date.now()): Promise<boolean> {
  if (typeof id !== "string" || !UUID_RE.test(id)) return false;
  const url = getEnv("PUBLIC_SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("push-notify : variables Supabase manquantes");
    return false;
  }

  const supabase = createClient(url, serviceKey);
  const { data, error } = await supabase
    .from("reservations")
    .update({ push_notifie_le: new Date(now).toISOString() })
    .eq("id", id)
    .is("push_notifie_le", null)
    .gt("created_at", new Date(now - PUSH_WINDOW_MINUTES * 60_000).toISOString())
    .select("client_nom, nb_personnes, creneau_debut, type_reservation")
    .maybeSingle();

  if (error) {
    console.error("push-notify : marquage impossible", error);
    return false;
  }
  if (!data) return false;

  await notifyNewReservation(reservationPushMessage(data as PushReservation));
  return true;
}
