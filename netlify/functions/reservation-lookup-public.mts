import type { Context, Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { verifyReservationToken } from "../lib/reservation-token.ts";

const MIN_NOTICE_MS = 24 * 60 * 60 * 1000; // doit rester cohérent avec reservation-cancel-public.mts

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const token = url.searchParams.get("token");
  if (!id || !token) return json({ error: "Missing id or token" }, 400);

  if (!(await verifyReservationToken(id, token))) {
    return json({ error: "Invalid token" }, 403);
  }

  const supabaseUrl = getEnv("PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase service role configuration");
    return json({ error: "Server configuration error" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: reservation, error } = await supabase
    .from("reservations")
    .select("id, statut, client_nom, client_email, client_telephone, nb_personnes, duree_minutes, creneau_debut, creneau_fin, reservation_boxes(boxes(type))")
    .eq("id", id)
    .single();

  if (error || !reservation) {
    return json({ error: "Reservation not found" }, 404);
  }

  const noticeMs = new Date(reservation.creneau_debut).getTime() - Date.now();
  const vrType = ((reservation as any).reservation_boxes ?? [])[0]?.boxes?.type ?? "filaire";

  return json({
    ok: true,
    reservation: {
      client_nom: reservation.client_nom,
      client_email: reservation.client_email,
      client_telephone: reservation.client_telephone,
      nb_personnes: reservation.nb_personnes,
      duree_minutes: reservation.duree_minutes,
      creneau_debut: reservation.creneau_debut,
      creneau_fin: reservation.creneau_fin,
      vr_type: vrType,
      statut: reservation.statut,
    },
    can_cancel: reservation.statut === "confirmée" && noticeMs >= MIN_NOTICE_MS,
    already_cancelled: reservation.statut === "annulée",
  });
};

export const config: Config = {
  path: "/api/reservation-lookup-public",
};
