import type { Context, Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { verifyReservationToken } from "../lib/reservation-token.ts";
import { sendCancellationAdminEmail } from "../lib/reservation-emails.ts";

const MIN_NOTICE_MS = 24 * 60 * 60 * 1000; // 24h — en dessous, on refuse l'auto-annulation

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
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { id: string; token: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { id, token } = body;
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

  const { data: reservation, error: fetchErr } = await supabase
    .from("reservations")
    .select("id, statut, client_nom, client_email, client_telephone, nb_personnes, duree_minutes, creneau_debut, creneau_fin, notes, reservation_boxes(boxes(nom, type))")
    .eq("id", id)
    .single();

  if (fetchErr || !reservation) {
    return json({ error: "Reservation not found" }, 404);
  }

  if (reservation.statut === "annulée") {
    return json({ ok: true, already_cancelled: true });
  }
  if (reservation.statut !== "confirmée") {
    return json({ error: "Cette réservation ne peut plus être annulée en ligne." }, 409);
  }

  const noticeMs = new Date(reservation.creneau_debut).getTime() - Date.now();
  if (noticeMs < MIN_NOTICE_MS) {
    return json({ error: "Le délai d'annulation en ligne (24h avant le créneau) est dépassé. Merci de nous appeler au 06 71 41 06 95." }, 422);
  }

  const { error: updateErr } = await supabase
    .from("reservations")
    .update({ statut: "annulée" })
    .eq("id", id);

  if (updateErr) {
    return json({ error: updateErr.message }, 500);
  }

  const apiKey = getEnv("MAILJET_API_KEY");
  const apiSecret = getEnv("MAILJET_API_SECRET");
  const senderEmail = getEnv("MAILJET_SENDER_EMAIL") || "contact@vr-cafe.fr";

  if (apiKey && apiSecret) {
    try {
      const resaBoxes = (reservation as any).reservation_boxes ?? [];
      const boxNames = resaBoxes.map((rb: any) => rb.boxes?.nom).filter(Boolean).join(", ");
      const vrType = resaBoxes[0]?.boxes?.type ?? "filaire";

      await sendCancellationAdminEmail(
        {
          client_nom: reservation.client_nom,
          client_email: reservation.client_email,
          client_telephone: reservation.client_telephone,
          nb_personnes: reservation.nb_personnes,
          duree_minutes: reservation.duree_minutes,
          vr_type: vrType,
          creneau_debut: reservation.creneau_debut,
          creneau_fin: reservation.creneau_fin,
          box_names: boxNames,
          ref: id.split("-")[0].toUpperCase(),
          notes: reservation.notes,
        },
        { apiKey, apiSecret, senderEmail }
      );
    } catch (error) {
      console.error("Failed to send cancellation notification email:", error);
    }
  }

  return json({ ok: true });
};

export const config: Config = {
  path: "/api/reservation-cancel-public",
};
