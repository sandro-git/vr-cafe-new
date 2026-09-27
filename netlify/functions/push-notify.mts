import type { Context, Config } from "@netlify/functions";
import { notifyReservationOnce } from "../lib/reservation-push.ts";

// Appelé par les formulaires de réservation publics : seul l'id de la réservation est
// accepté, le texte est construit côté serveur et une réservation n'est notifiée qu'une
// fois (cf. netlify/lib/reservation-push.ts). Réponse identique que la notification parte
// ou non, pour ne rien révéler sur l'id reçu.
export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await notifyReservationOnce(body?.id);
  } catch (err) {
    console.error("push-notify error:", err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/push-notify",
};
