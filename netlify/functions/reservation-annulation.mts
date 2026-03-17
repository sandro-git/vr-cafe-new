import type { Context, Config } from "@netlify/functions";
import Mailjet from "node-mailjet";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
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

  const debut = new Date(creneau_debut);
  const fin = new Date(creneau_fin);
  const dateFmt = debut.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const heureFmt = debut.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const heureFinFmt = fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const vrIcon = vr_type === "sans_fil" ? "📡" : "🔌";
  const vrLabel = vr_type === "sans_fil" ? "VR Sans Fil" : "VR Filaire";

  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">❌ Réservation annulée – #${ref}</h2>
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <h3 style="margin: 0 0 16px; color: #1e293b;">Client</h3>
        <p style="margin: 4px 0;"><strong>Nom :</strong> ${client_nom}</p>
        <p style="margin: 4px 0;"><strong>Email :</strong> <a href="mailto:${client_email}">${client_email}</a></p>
        <p style="margin: 4px 0;"><strong>Téléphone :</strong> ${client_telephone}</p>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <h3 style="margin: 0 0 16px; color: #1e293b;">Réservation annulée</h3>
        <p style="margin: 4px 0;"><strong>Date :</strong> ${dateFmt}</p>
        <p style="margin: 4px 0;"><strong>Heure :</strong> ${heureFmt} – ${heureFinFmt}</p>
        <p style="margin: 4px 0;"><strong>Durée :</strong> ${duree_minutes} min</p>
        <p style="margin: 4px 0;"><strong>Joueurs :</strong> ${nb_personnes}</p>
        <p style="margin: 4px 0;"><strong>Type VR :</strong> ${vrIcon} ${vrLabel}</p>
        <p style="margin: 4px 0;"><strong>Box :</strong> ${box_names}</p>
        ${notes ? `<p style="margin: 4px 0;"><strong>Notes :</strong> ${notes}</p>` : ""}
      </div>
    </div>
  `;

  const adminSubject = `[Annulation] ${client_nom} · ${dateFmt} · ${heureFmt}`;

  try {
    const mailjet = new Mailjet({ apiKey, apiSecret });

    await mailjet.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: { Email: senderEmail, Name: "VR Café" },
          To: [{ Email: "sandro@vr-cafe.fr", Name: "VR Café Admin" }],
          Subject: adminSubject,
          HTMLPart: adminHtml,
          ReplyTo: { Email: client_email, Name: client_nom },
        },
      ],
    });

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
