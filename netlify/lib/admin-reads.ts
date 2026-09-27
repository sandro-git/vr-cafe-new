// Lectures admin des réservations et des clients (données personnelles).
// La clé anon n'a plus accès en lecture à `reservations`, `reservation_boxes`
// ni `clients` : les pages /admin/* passent par /api/admin/db (session admin
// vérifiée) qui exécute ces requêtes avec la service role.
// Requêtes fixes : le navigateur ne choisit que des paramètres validés ici.
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminReadResult = { status: number; body: Record<string, unknown> };

const RESERVATION_WITH_BOXES = "*, reservation_boxes ( box_id, boxes ( nom, type ) )";
const SUGGESTION_COLUMNS = { nom: "client_nom", email: "client_email", telephone: "client_telephone" } as const;
const MAX_RANGE_DAYS = 62;

function ok(data: unknown): AdminReadResult {
  return { status: 200, body: { data } };
}
function fail(error: string, status = 400): AdminReadResult {
  return { status, body: { error } };
}
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export const ADMIN_READ_ACTIONS = [
  "list_reservations",
  "client_suggestions",
  "list_clients",
  "client_reservations",
  "marketing_reservations",
] as const;
export type AdminReadAction = (typeof ADMIN_READ_ACTIONS)[number];

export function isAdminReadAction(action: unknown): action is AdminReadAction {
  return ADMIN_READ_ACTIONS.includes(action as AdminReadAction);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runAdminRead(supabase: SupabaseClient<any, any, any>, action: AdminReadAction, body: Record<string, unknown>): Promise<AdminReadResult> {
  switch (action) {
    // Réservations dont le créneau commence dans [start, end] (page réservations, planning)
    case "list_reservations": {
      const start = parseDate(body.start);
      const end = parseDate(body.end);
      if (!start || !end || end < start) return fail("Dates invalides");
      if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000)
        return fail(`Période trop longue (max ${MAX_RANGE_DAYS} jours)`);
      let query = supabase
        .from("reservations")
        .select(RESERVATION_WITH_BOXES)
        .gte("creneau_debut", start.toISOString())
        .lte("creneau_debut", end.toISOString());
      if (body.active_only === true) query = query.not("statut", "in", '("annulée","no_show")');
      const { data, error } = await query.order("creneau_debut");
      if (error) return fail(error.message, 500);
      return ok(data ?? []);
    }

    // Autocomplete client des formulaires admin (nom, email ou téléphone)
    case "client_suggestions": {
      const field = body.field as keyof typeof SUGGESTION_COLUMNS;
      const value = typeof body.value === "string" ? body.value.trim() : "";
      if (!(field in SUGGESTION_COLUMNS)) return fail("Champ invalide");
      if (value.length < 2) return ok([]);
      if (value.length > 100) return fail("Recherche trop longue");
      const { data, error } = await supabase
        .from("reservations")
        .select("client_nom, client_email, client_telephone")
        .ilike(SUGGESTION_COLUMNS[field], `%${value}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return fail(error.message, 500);
      return ok(data ?? []);
    }

    // CRM : fiches clients + réservations minimales pour les stats
    case "list_clients": {
      const [clients, reservations] = await Promise.all([
        supabase.from("clients").select("id, nom, email, telephone"),
        supabase.from("reservations").select("client_id, statut, creneau_debut"),
      ]);
      if (clients.error) return fail(clients.error.message, 500);
      if (reservations.error) return fail(reservations.error.message, 500);
      return ok({ clients: clients.data ?? [], reservations: reservations.data ?? [] });
    }

    // Historique des réservations d'un client
    case "client_reservations": {
      if (!isUuid(body.client_id)) return fail("client_id invalide");
      const { data, error } = await supabase
        .from("reservations")
        .select(RESERVATION_WITH_BOXES)
        .eq("client_id", body.client_id)
        .order("creneau_debut", { ascending: false });
      if (error) return fail(error.message, 500);
      return ok(data ?? []);
    }

    // Segments marketing (fidèles, inactifs, nouveaux)
    case "marketing_reservations": {
      const { data, error } = await supabase
        .from("reservations")
        .select("client_nom, client_email, client_telephone, statut, creneau_debut")
        .order("creneau_debut", { ascending: false });
      if (error) return fail(error.message, 500);
      return ok(data ?? []);
    }
  }
}
