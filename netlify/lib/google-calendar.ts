// Client REST minimal pour l'API Google Calendar v3 — utilisé par la synchro des
// réservations vers l'agenda « Réservation » (netlify/lib/reservation-calendar.ts).
// Même client OAuth que google-business.ts (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET),
// mais un refresh_token distinct (GOOGLE_CALENDAR_REFRESH_TOKEN) : l'agenda peut
// appartenir à un autre compte Google que la fiche Business Profile, et on ne touche
// pas au jeton des avis. Jeton obtenu une fois avec scripts/google-calendar-auth.mts.

const API = "https://www.googleapis.com/calendar/v3";

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

function getEnv(key: string): string | undefined {
  try {
    return Netlify.env.get(key);
  } catch {
    /* hors contexte Netlify (tests, script local) */
  }
  return process.env[key];
}

/** Vrai si les variables nécessaires à la synchro sont présentes. */
export function isCalendarConfigured(): boolean {
  return Boolean(
    getEnv("GOOGLE_CLIENT_ID") && getEnv("GOOGLE_CLIENT_SECRET") && getEnv("GOOGLE_CALENDAR_REFRESH_TOKEN"),
  );
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getEnv("GOOGLE_CLIENT_ID") ?? "",
      client_secret: getEnv("GOOGLE_CLIENT_SECRET") ?? "",
      refresh_token: getEnv("GOOGLE_CALENDAR_REFRESH_TOKEN") ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Échec du refresh OAuth Google Calendar (${res.status}) : ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedAccessToken.token;
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function fail(res: Response, what: string): Promise<never> {
  const text = await res.text().catch(() => "");
  throw new Error(`Échec de ${what} Google Calendar (${res.status}) : ${text}`);
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  colorId?: string;
  status?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

let cachedCalendarId: { name: string; id: string } | null = null;

/**
 * Identifiant de l'agenda : GOOGLE_CALENDAR_ID s'il est défini, sinon l'agenda
 * de la liste du compte dont le nom est `name` (casse et accents ignorés).
 */
export async function resolveCalendarId(name: string): Promise<string> {
  const explicit = getEnv("GOOGLE_CALENDAR_ID");
  if (explicit) return explicit;
  if (cachedCalendarId?.name === name) return cachedCalendarId.id;

  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ maxResults: "250", minAccessRole: "writer" });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await call("GET", `/users/me/calendarList?${qs}`);
    if (!res.ok) await fail(res, "calendarList");
    const data = (await res.json()) as {
      items?: { id: string; summary?: string; summaryOverride?: string }[];
      nextPageToken?: string;
    };
    const found = (data.items ?? []).find(
      (c) => norm(c.summaryOverride ?? c.summary ?? "") === norm(name) || norm(c.summary ?? "") === norm(name),
    );
    if (found) {
      cachedCalendarId = { name, id: found.id };
      return found.id;
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  throw new Error(`Agenda Google « ${name} » introuvable (ou sans droit d'écriture)`);
}

/** Événements de l'agenda portant la propriété privée `key=value`, entre timeMin et timeMax. */
export async function listEventsByProperty(
  calendarId: string,
  key: string,
  value: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({
      privateExtendedProperty: `${key}=${value}`,
      timeMin,
      timeMax,
      singleEvents: "true",
      maxResults: "2500",
    });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await call("GET", `/calendars/${encodeURIComponent(calendarId)}/events?${qs}`);
    if (!res.ok) await fail(res, "events.list");
    const data = (await res.json()) as { items?: CalendarEvent[]; nextPageToken?: string };
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return events;
}

/**
 * Crée l'événement avec son id. Si l'id existe déjà (événement supprimé à la main
 * dans Google : il reste en corbeille avec le même id → 409), on le remplace.
 */
export async function createEvent(calendarId: string, event: CalendarEvent): Promise<void> {
  const res = await call("POST", `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, event);
  if (res.status === 409) return updateEvent(calendarId, event);
  if (!res.ok) await fail(res, "events.insert");
}

export async function updateEvent(calendarId: string, event: CalendarEvent): Promise<void> {
  const res = await call(
    "PUT",
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}?sendUpdates=none`,
    event,
  );
  if (!res.ok) await fail(res, "events.update");
}

export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  const res = await call(
    "DELETE",
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
  );
  // 404 / 410 : déjà supprimé
  if (!res.ok && res.status !== 404 && res.status !== 410) await fail(res, "events.delete");
}
