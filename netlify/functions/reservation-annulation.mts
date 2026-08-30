import type { Context, Config } from "@netlify/functions";
import { sendCancellationAdminEmail } from "../lib/reservation-emails.ts";

function checkAuth(req: Request): boolean {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const adminPassword = Netlify.env.get("ADMIN_PASSWORD") || process.env.ADMIN_PASSWORD;
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  const sessionValue = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;
  return !!adminPassword && sessionValue === adminPassword;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!checkAuth(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: {
    client_nom: string;
    client_email: string;
    client_telephone: string;
    nb_personnes: number;
    duree_minutes: number;
    vr_type: string;
    creneau_debut: string;
    creneau_fin: string;
    box_names: string;
    ref: string;
    notes: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const {
    client_nom,
    client_email,
    client_telephone,
    nb_personnes,
    duree_minutes,
    vr_type,
    creneau_debut,
    creneau_fin,
    box_names,
    ref,
    notes,
  } = body;

  const apiKey = Netlify.env.get("MAILJET_API_KEY") || process.env.MAILJET_API_KEY;
  const apiSecret = Netlify.env.get("MAILJET_API_SECRET") || process.env.MAILJET_API_SECRET;
  const senderEmail = Netlify.env.get("MAILJET_SENDER_EMAIL") || process.env.MAILJET_SENDER_EMAIL || "contact@vr-cafe.fr";

  if (!apiKey || !apiSecret) {
    console.error("Missing Mailjet credentials");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await sendCancellationAdminEmail(
      { client_nom, client_email, client_telephone, nb_personnes, duree_minutes, vr_type, creneau_debut, creneau_fin, box_names, ref, notes },
      { apiKey, apiSecret, senderEmail }
    );
    console.log(`Cancellation email sent for ref ${ref}`);
  } catch (error) {
    console.error("Failed to send cancellation email:", error);
  }

return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/reservation-annulation",
};
