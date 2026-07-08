import type { Context, Config } from "@netlify/functions";
import Mailjet from "node-mailjet";
import { syncClientToMailjet } from "../lib/mailjet-contacts.ts";
import { calcMontant } from "../../src/lib/pricing.ts";

const ALLOWED_ORIGINS = [
  "https://vr-cafe.fr",
  "https://www.vr-cafe.fr",
  "http://localhost:4321",
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
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

  // Validation des champs obligatoires
  if (
    !client_nom || typeof client_nom !== "string" || client_nom.length > 200 ||
    !client_email || !EMAIL_REGEX.test(client_email) || client_email.length > 254 ||
    !ref || typeof ref !== "string" || ref.length > 100 ||
    !creneau_debut || !creneau_fin ||
    typeof nb_personnes !== "number" || nb_personnes < 1 || nb_personnes > 50
  ) {
    return new Response(
      JSON.stringify({ error: "Invalid input" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

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
    timeZone: "Europe/Paris",
  });
  const heureFmt = debut.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const heureFinFmt = fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const vrIcon = vr_type === "sans_fil" ? "📡" : "🔌";
  const vrLabel = vr_type === "sans_fil" ? "VR Sans Fil" : "VR Filaire";
  const montant = calcMontant(duree_minutes, nb_personnes);
  const montantFmt = montant !== null ? `${montant} €` : null;

  const clientHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; color: #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #7c3aed, #2563eb); padding: 32px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px;">🎮 Réservation confirmée !</h1>
        <p style="margin: 8px 0 0; color: #c4b5fd; font-size: 14px;">VR Café – Référence <strong>#${ref}</strong></p>
      </div>
      <div style="padding: 32px;">
        <p style="color: #94a3b8; margin: 0 0 24px;">Bonjour <strong style="color: #e2e8f0;">${escHtml(client_nom)}</strong>,</p>
        <p style="color: #94a3b8; margin: 0 0 24px;">Votre réservation au VR Café est confirmée. Voici le récapitulatif :</p>
        <div style="background-color: #1e293b; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">📅 Date</td>
              <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right;">${dateFmt}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">🕐 Heure</td>
              <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right;">${heureFmt} – ${heureFinFmt}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">⏱ Durée</td>
              <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right;">${duree_minutes} min</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">👥 Joueurs</td>
              <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right;">${nb_personnes} personne${nb_personnes > 1 ? "s" : ""}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">${vrIcon} Type VR</td>
              <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right;">${vrLabel}</td>
            </tr>
            ${montantFmt ? `<tr>
              <td style="padding: 8px 0; border-top: 1px solid #334155; color: #64748b; font-size: 14px;">💶 Montant total</td>
              <td style="padding: 8px 0; border-top: 1px solid #334155; color: #4ade80; font-size: 16px; font-weight: bold; text-align: right;">${montantFmt}</td>
            </tr>` : ""}
          </table>
        </div>
        <div style="background-color: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 13px;">Une question ? Appelez-nous au</p>
          <p style="margin: 4px 0 0; color: #7c3aed; font-size: 18px; font-weight: bold;">📞 06 71 41 06 95</p>
        </div>
        <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">
          VR Café · Ce message a été envoyé automatiquement suite à votre réservation.
        </p>
      </div>
    </div>
  `;

  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">🎮 Nouvelle réservation – #${ref}</h2>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <h3 style="margin: 0 0 16px; color: #1e293b;">Client</h3>
        <p style="margin: 4px 0;"><strong>Nom :</strong> ${escHtml(client_nom)}</p>
        <p style="margin: 4px 0;"><strong>Email :</strong> <a href="mailto:${escHtml(client_email)}">${escHtml(client_email)}</a></p>
        <p style="margin: 4px 0;"><strong>Téléphone :</strong> ${escHtml(client_telephone)}</p>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <h3 style="margin: 0 0 16px; color: #1e293b;">Réservation</h3>
        <p style="margin: 4px 0;"><strong>Date :</strong> ${escHtml(dateFmt)}</p>
        <p style="margin: 4px 0;"><strong>Heure :</strong> ${escHtml(heureFmt)} – ${escHtml(heureFinFmt)}</p>
        <p style="margin: 4px 0;"><strong>Durée :</strong> ${Number(duree_minutes)} min</p>
        <p style="margin: 4px 0;"><strong>Joueurs :</strong> ${Number(nb_personnes)}</p>
        <p style="margin: 4px 0;"><strong>Type VR :</strong> ${vrIcon} ${escHtml(vrLabel)}</p>
        <p style="margin: 4px 0;"><strong>Box :</strong> ${escHtml(box_names)}</p>
        ${montantFmt ? `<p style="margin: 4px 0;"><strong>Montant :</strong> ${escHtml(montantFmt)}</p>` : ""}
        ${notes ? `<p style="margin: 4px 0;"><strong>Notes :</strong> ${escHtml(notes)}</p>` : ""}
      </div>
    </div>
  `;

  const adminSubject = `[Nouvelle résa] ${client_nom} · ${dateFmt} · ${heureFmt}`;

  try {
    const mailjet = new Mailjet({ apiKey, apiSecret });

    await mailjet.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: { Email: senderEmail, Name: "VR Café" },
          To: [{ Email: client_email, Name: client_nom }],
          Subject: `Confirmation de réservation VR Café - #${ref}`,
          HTMLPart: clientHtml,
        },
        {
          From: { Email: senderEmail, Name: "VR Café" },
          To: [{ Email: "sandro@vr-cafe.fr", Name: "VR Café Admin" }],
          Subject: adminSubject,
          HTMLPart: adminHtml,
          ReplyTo: { Email: client_email, Name: client_nom },
        },
      ],
    });

    console.log(`Reservation emails sent for ref ${ref} to ${client_email}`);
  } catch (error) {
    console.error("Failed to send reservation emails:", error);
    // Ne pas bloquer la confirmation — l'email est secondaire
  }

  // Sync Mailjet contacts (fire-and-forget)
  (async () => {
    try {
      await syncClientToMailjet({
        nom: client_nom,
        email: client_email,
        telephone: client_telephone,
        vrType: vr_type,
        creneauDebut: creneau_debut,
        apiKey: apiKey!,
        apiSecret: apiSecret!,
      });
    } catch (e) {
      console.error("Mailjet contacts sync error:", e);
    }
  })();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/reservation-confirmation",
};
