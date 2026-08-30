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
