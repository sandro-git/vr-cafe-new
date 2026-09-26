import Mailjet from "node-mailjet";

function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export interface CancellationDetails {
  client_nom: string;
  client_email: string | null;
  client_telephone: string;
  nb_personnes: number;
  duree_minutes: number;
  vr_type: string;
  creneau_debut: string;
  creneau_fin: string;
  box_names: string;
  ref: string;
  notes: string | null;
}

/** Envoie à l'admin l'email de notification d'annulation d'une réservation. */
export async function sendCancellationAdminEmail(
  details: CancellationDetails,
  creds: { apiKey: string; apiSecret: string; senderEmail: string }
): Promise<void> {
  const {
    client_nom, client_email, client_telephone, nb_personnes,
    duree_minutes, vr_type, creneau_debut, creneau_fin, box_names, ref, notes,
  } = details;

  const debut = new Date(creneau_debut);
  const fin = new Date(creneau_fin);
  const dateFmt = debut.toLocaleDateString("fr-FR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Paris",
  });
  const heureFmt = debut.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const heureFinFmt = fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const vrIcon = vr_type === "sans_fil" ? "📡" : "🔌";
  const vrLabel = vr_type === "sans_fil" ? "VR Sans Fil" : "VR Filaire";

  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">❌ Réservation annulée – #${ref}</h2>
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <h3 style="margin: 0 0 16px; color: #1e293b;">Client</h3>
        <p style="margin: 4px 0;"><strong>Nom :</strong> ${escHtml(client_nom)}</p>
        <p style="margin: 4px 0;"><strong>Email :</strong> ${client_email ? `<a href="mailto:${escHtml(client_email)}">${escHtml(client_email)}</a>` : "— (non renseigné)"}</p>
        <p style="margin: 4px 0;"><strong>Téléphone :</strong> ${escHtml(client_telephone)}</p>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <h3 style="margin: 0 0 16px; color: #1e293b;">Réservation annulée</h3>
        <p style="margin: 4px 0;"><strong>Date :</strong> ${escHtml(dateFmt)}</p>
        <p style="margin: 4px 0;"><strong>Heure :</strong> ${escHtml(heureFmt)} – ${escHtml(heureFinFmt)}</p>
        <p style="margin: 4px 0;"><strong>Durée :</strong> ${Number(duree_minutes)} min</p>
        <p style="margin: 4px 0;"><strong>Joueurs :</strong> ${Number(nb_personnes)}</p>
        <p style="margin: 4px 0;"><strong>Type VR :</strong> ${vrIcon} ${escHtml(vrLabel)}</p>
        <p style="margin: 4px 0;"><strong>Box :</strong> ${escHtml(box_names)}</p>
        ${notes ? `<p style="margin: 4px 0;"><strong>Notes :</strong> ${escHtml(notes)}</p>` : ""}
      </div>
    </div>
  `;

  const mailjet = new Mailjet({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
  await mailjet.post("send", { version: "v3.1" }).request({
    Messages: [
      {
        From: { Email: creds.senderEmail, Name: "VR Café" },
        To: [{ Email: "sandro@vr-cafe.fr", Name: "VR Café Admin" }],
        Subject: `[Annulation] ${client_nom} · ${dateFmt} · ${heureFmt}`,
        HTMLPart: adminHtml,
        ...(client_email ? { ReplyTo: { Email: client_email, Name: client_nom } } : {}),
      },
    ],
  });
}

/** Envoie au client la confirmation de l'annulation qu'il a faite en ligne. */
export async function sendCancellationClientEmail(
  details: CancellationDetails,
  creds: { apiKey: string; apiSecret: string; senderEmail: string }
): Promise<void> {
  const { client_nom, client_email, nb_personnes, duree_minutes, creneau_debut, creneau_fin, ref } = details;
  if (!client_email) return;

  const debut = new Date(creneau_debut);
  const fin = new Date(creneau_fin);
  const dateFmt = debut.toLocaleDateString("fr-FR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Paris",
  });
  const heureFmt = debut.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const heureFinFmt = fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

  // Même habillage que l'email de confirmation ; boutons en <table> (Gmail ignore display:flex)
  const clientHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; color: #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #7c3aed, #2563eb); padding: 32px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Réservation annulée</h1>
        <p style="margin: 8px 0 0; color: #c4b5fd; font-size: 14px;">VR Café – Référence <strong>#${escHtml(ref)}</strong></p>
      </div>
      <div style="padding: 32px;">
        <p style="color: #94a3b8; margin: 0 0 24px;">Bonjour <strong style="color: #e2e8f0;">${escHtml(client_nom)}</strong>,</p>
        <p style="color: #94a3b8; margin: 0 0 24px;">Votre réservation a bien été annulée. Pour rappel, il s'agissait de :</p>
        <div style="background-color: #1e293b; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">📅 Date</td>
              <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right; text-decoration: line-through;">${escHtml(dateFmt)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">🕐 Heure</td>
              <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right; text-decoration: line-through;">${escHtml(heureFmt)} – ${escHtml(heureFinFmt)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">⏱ Durée</td>
              <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right;">${Number(duree_minutes)} min</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">👥 Joueurs</td>
              <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right;">${Number(nb_personnes)} personne${Number(nb_personnes) > 1 ? "s" : ""}</td>
            </tr>
          </table>
        </div>
        <p style="color: #94a3b8; margin: 0 0 16px; text-align: center;">Envie de revenir ? Choisissez un nouveau créneau en ligne :</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
          <tr>
            <td align="center">
              <a href="https://vr-cafe.fr/reservation" style="display: inline-block; padding: 12px 28px; border-radius: 8px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600;">Réserver un nouveau créneau</a>
            </td>
          </tr>
        </table>
        <div style="background-color: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 13px;">Une question ? Appelez-nous au</p>
          <p style="margin: 4px 0 0; color: #7c3aed; font-size: 18px; font-weight: bold;">📞 06 71 41 06 95</p>
        </div>
        <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">
          VR Café · Ce message a été envoyé automatiquement suite à l'annulation de votre réservation.
        </p>
      </div>
    </div>
  `;

  const mailjet = new Mailjet({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
  await mailjet.post("send", { version: "v3.1" }).request({
    Messages: [
      {
        From: { Email: creds.senderEmail, Name: "VR Café" },
        To: [{ Email: client_email, Name: client_nom }],
        Subject: `Annulation de votre réservation VR Café - #${ref}`,
        HTMLPart: clientHtml,
      },
    ],
  });
}
