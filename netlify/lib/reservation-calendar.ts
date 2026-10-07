// Synchronisation des réservations Supabase → agenda Google « Réservation ».
//
// Réconciliation complète (fonction planifiée calendar-sync) plutôt qu'un appel à
// chaque écriture : les réservations sont créées, modifiées et annulées par de
// nombreux chemins (formulaires publics en clé anon, admin, MCP, WhatsApp,
// annulation client…). Supabase reste la seule source de vérité :
// - réservation confirmée ou no-show → événement créé, ou remplacé si son contenu a changé ;
// - réservation annulée ou supprimée → événement supprimé.
// L'événement a un id déterministe (dérivé de l'uuid) et porte en propriétés
// privées l'id de la réservation et une empreinte de son contenu : on ne réécrit
// que ce qui a changé. Les retouches faites à la main dans Google ne sont pas
// écrasées tant que la réservation ne change pas.

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  createEvent,
  deleteEvent,
  isCalendarConfigured,
  listEventsByProperty,
  resolveCalendarId,
  updateEvent,
  type CalendarEvent,
} from "./google-calendar.ts";

export const CALENDAR_NAME = "Réservation";
export const SOURCE_KEY = "source";
export const SOURCE_VALUE = "vr-cafe";
const TIME_ZONE = "Europe/Paris";
/** Fenêtre synchronisée : 7 jours en arrière (no-show saisis après coup) → 1 an en avant. */
export const PAST_DAYS = 7;
export const FUTURE_DAYS = 365;

export interface CalendarReservation {
  id: string;
  statut: string;
  type_reservation: string | null;
  client_nom: string | null;
  client_email: string | null;
  client_telephone: string | null;
  nb_personnes: number | null;
  duree_minutes: number | null;
  creneau_debut: string;
  creneau_fin: string;
  notes: string | null;
  reservation_boxes?: { boxes: { nom: string | null; type: string | null } | null }[] | null;
}

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

/** Id d'événement Google (base32hex, 5-1024 caractères) dérivé de l'uuid. */
export function eventIdFor(reservationId: string): string {
  return `vrc${reservationId.replace(/-/g, "").toLowerCase()}`;
}

const TYPE_LABEL: Record<string, { icon: string; label: string; colorId?: string }> = {
  standard: { icon: "🎮", label: "Standard" },
  anniversaire: { icon: "🎂", label: "Anniversaire", colorId: "4" },
  mdj: { icon: "🏠", label: "MDJ", colorId: "3" },
};

/** Événement Google attendu pour une réservation (sans l'empreinte). */
export function buildEvent(r: CalendarReservation, siteUrl = "https://vr-cafe.fr"): CalendarEvent {
  const type = TYPE_LABEL[r.type_reservation ?? "standard"] ?? TYPE_LABEL.standard;
  const boxes = (r.reservation_boxes ?? []).map((rb) => rb.boxes).filter((b) => b !== null);
  const sansFil = boxes.some((b) => b.type === "sans_fil");
  const vr = boxes.length ? (sansFil ? "VR sans fil" : "VR filaire") : null;
  const unite = r.type_reservation === "mdj" ? "enfants" : "pers.";
  const duree = r.duree_minutes ? (r.duree_minutes % 60 === 0 ? `${r.duree_minutes / 60}h` : `${r.duree_minutes} min`) : null;
  const noShow = r.statut === "no_show";

  const summary = [
    `${noShow ? "🚫 No-show · " : ""}${type.icon} ${r.client_nom?.trim() || "Client"}`,
    `${r.nb_personnes ?? "?"} ${unite}`,
    [duree, vr?.replace("VR ", "")].filter(Boolean).join(" "),
  ].filter(Boolean).join(" · ");

  const boxNames = boxes.map((b) => b.nom).filter(Boolean).join(", ");
  const description = [
    `Réf. #${r.id.split("-")[0].toUpperCase()} — ${type.label}${noShow ? " (no-show)" : ""}`,
    `Personnes : ${r.nb_personnes ?? "?"}`,
    duree || vr ? `Session : ${[duree, vr].filter(Boolean).join(" — ")}` : null,
    boxNames ? `Box : ${boxNames}` : null,
    r.client_telephone ? `Téléphone : ${r.client_telephone}` : null,
    r.client_email ? `Email : ${r.client_email}` : null,
    r.notes?.trim() ? `\nNotes : ${r.notes.trim()}` : null,
    `\n${siteUrl.replace(/\/$/, "")}/admin/reservations`,
  ].filter((l) => l !== null).join("\n");

  const colorId = noShow ? "8" : type.colorId;
  return {
    id: eventIdFor(r.id),
    status: "confirmed",
    summary,
    description,
    ...(colorId ? { colorId } : {}),
    start: { dateTime: new Date(r.creneau_debut).toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: new Date(r.creneau_fin).toISOString(), timeZone: TIME_ZONE },
    extendedProperties: { private: { [SOURCE_KEY]: SOURCE_VALUE, reservation_id: r.id } },
  };
}

/** Empreinte du contenu synchronisé : sert à ne réécrire que les événements modifiés. */
export function eventHash(event: CalendarEvent): string {
  const { summary, description, colorId, start, end } = event;
  return createHash("sha256")
    .update(JSON.stringify([summary, description, colorId ?? null, start.dateTime, end.dateTime]))
    .digest("hex")
    .slice(0, 16);
}

export interface SyncPlan {
  create: CalendarEvent[];
  update: CalendarEvent[];
  delete: string[];
}

/** Compare les réservations actives et les événements existants (même fenêtre). */
export function planCalendarSync(
  reservations: CalendarReservation[],
  existing: CalendarEvent[],
  siteUrl?: string,
): SyncPlan {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const plan: SyncPlan = { create: [], update: [], delete: [] };
  const wanted = new Set<string>();

  for (const r of reservations) {
    if (r.statut !== "confirmée" && r.statut !== "no_show") continue;
    const event = buildEvent(r, siteUrl);
    const h = eventHash(event);
    event.extendedProperties!.private!.h = h;
    wanted.add(event.id);
    const current = byId.get(event.id);
    if (!current) plan.create.push(event);
    else if (current.extendedProperties?.private?.h !== h) plan.update.push(event);
  }
  for (const e of existing) {
    if (!wanted.has(e.id)) plan.delete.push(e.id);
  }
  return plan;
}

export interface SyncResult {
  skipped?: string;
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

/** Lit Supabase et Google, puis applique le plan. Une erreur sur un événement n'arrête pas les autres. */
export async function syncReservationsCalendar(now = Date.now()): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] };
  if (!isCalendarConfigured()) {
    result.skipped = "GOOGLE_CALENDAR_REFRESH_TOKEN (ou client OAuth) non configuré";
    return result;
  }
  const url = getEnv("PUBLIC_SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Variables Supabase manquantes");

  const timeMin = new Date(now - PAST_DAYS * 86_400_000).toISOString();
  const timeMax = new Date(now + FUTURE_DAYS * 86_400_000).toISOString();

  // Même fenêtre que Google (fin > timeMin, début < timeMax) : sinon un événement
  // à cheval sur la borne serait listé chez Google mais pas en base, donc supprimé.
  const { data, error } = await createClient(url, serviceKey)
    .from("reservations")
    .select(
      "id, statut, type_reservation, client_nom, client_email, client_telephone, nb_personnes, duree_minutes, creneau_debut, creneau_fin, notes, reservation_boxes(boxes(nom, type))",
    )
    .gt("creneau_fin", timeMin)
    .lt("creneau_debut", timeMax)
    .order("creneau_debut");
  if (error) throw new Error(`Lecture des réservations impossible : ${error.message}`);

  const calendarId = await resolveCalendarId(getEnv("GOOGLE_CALENDAR_NAME") || CALENDAR_NAME);
  const existing = await listEventsByProperty(calendarId, SOURCE_KEY, SOURCE_VALUE, timeMin, timeMax);
  const plan = planCalendarSync((data ?? []) as unknown as CalendarReservation[], existing, getEnv("URL"));

  const run = async (label: string, fn: () => Promise<void>, count: keyof Pick<SyncResult, "created" | "updated" | "deleted">) => {
    try {
      await fn();
      result[count]++;
    } catch (e) {
      result.errors.push(`${label} : ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  for (const ev of plan.create) await run(`création ${ev.id}`, () => createEvent(calendarId, ev), "created");
  for (const ev of plan.update) await run(`mise à jour ${ev.id}`, () => updateEvent(calendarId, ev), "updated");
  for (const id of plan.delete) await run(`suppression ${id}`, () => deleteEvent(calendarId, id), "deleted");
  return result;
}
