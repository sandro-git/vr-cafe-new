// Emails des bons cadeaux : le bon lui-même (à l'acheteur, qui le transmet ou l'imprime)
// et l'avis de vente à l'admin. Mise en page en <table> : Gmail ignore display:flex.
import Mailjet from "node-mailjet";
import type { Bon } from "./bon-repo.ts";

export interface MailjetCreds {
  apiKey: string;
  apiSecret: string;
  senderEmail: string;
}

export const ADMIN_EMAIL = "sandro@vr-cafe.fr";

function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const dateFr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) : "";

const euros = (n: number) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

/** Email contenant le bon (code, expérience, bénéficiaire, validité). */
export function bonClientEmail(bon: Bon): { subject: string; html: string } {
  const message = bon.message
    ? `<tr><td style="padding: 0 32px 24px;">
         <div style="background-color: #1e293b; border-left: 3px solid #a78bfa; border-radius: 6px; padding: 16px; color: #e2e8f0; font-style: italic; white-space: pre-line;">${escHtml(bon.message)}</div>
         <p style="margin: 8px 0 0; color: #94a3b8; font-size: 13px; text-align: right;">— ${escHtml(bon.acheteur_nom)}</p>
       </td></tr>`
    : "";

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; color: #e2e8f0; border-radius: 12px; overflow: hidden;">
      <tr><td style="background: linear-gradient(135deg, #7c3aed, #2563eb); padding: 32px; text-align: center;">
        <p style="margin: 0; font-size: 40px;">🎁</p>
        <h1 style="margin: 8px 0 0; color: #ffffff; font-size: 26px;">Bon cadeau VR Café</h1>
        <p style="margin: 8px 0 0; color: #ddd6fe; font-size: 15px;">Pour <strong style="color: #ffffff;">${escHtml(bon.beneficiaire_nom)}</strong></p>
      </td></tr>
      <tr><td style="padding: 32px 32px 24px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 14px;">Une session de réalité virtuelle</p>
        <p style="margin: 6px 0 0; color: #ffffff; font-size: 28px; font-weight: bold;">${escHtml(bon.offre_label)}</p>
      </td></tr>
      ${message}
      <tr><td style="padding: 0 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border: 2px dashed #7c3aed; border-radius: 10px;">
          <tr><td style="padding: 20px; text-align: center;">
            <p style="margin: 0; color: #94a3b8; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Code du bon</p>
            <p style="margin: 8px 0 0; color: #ffffff; font-size: 28px; font-weight: bold; letter-spacing: 3px; font-family: 'Courier New', monospace;">${escHtml(bon.code)}</p>
            <p style="margin: 10px 0 0; color: #94a3b8; font-size: 13px;">Valable jusqu'au <strong style="color: #e2e8f0;">${escHtml(dateFr(bon.expire_le))}</strong></p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding: 0 32px 24px;">
        <p style="margin: 0 0 8px; color: #e2e8f0; font-weight: bold;">Comment l'utiliser ?</p>
        <p style="margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.6;">
          1. Réservez votre créneau sur <a href="https://vr-cafe.fr/reservation" style="color: #a78bfa;">vr-cafe.fr/reservation</a> ou au 06 71 41 06 95,
          en indiquant le code du bon dans les remarques.<br>
          2. Présentez ce bon (imprimé ou sur votre téléphone) à votre arrivée.
        </p>
      </td></tr>
      <tr><td align="center" style="padding: 0 32px 24px;">
        <a href="https://vr-cafe.fr/reservation" style="display: inline-block; padding: 12px 28px; border-radius: 8px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600;">Réserver ma session</a>
      </td></tr>
      <tr><td style="padding: 0 32px 32px;">
        <p style="margin: 0; color: #475569; font-size: 12px; text-align: center; line-height: 1.5;">
          VR Café · 10 min de Perpignan, Canet-en-Roussillon · 06 71 41 06 95<br>
          Bon utilisable en une seule fois, non remboursable et non échangeable contre de l'argent.
        </p>
      </td></tr>
    </table>
  `;
  return { subject: `🎁 Votre bon cadeau VR Café pour ${bon.beneficiaire_nom} (${bon.code})`, html };
}

/** Avis de vente à l'admin. */
export function bonAdminEmail(bon: Bon): { subject: string; html: string } {
  const row = (label: string, value: string) =>
    `<tr><td style="padding: 4px 12px 4px 0; color: #64748b;">${label}</td><td style="padding: 4px 0; color: #1e293b;">${value}</td></tr>`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">🎁 Bon cadeau vendu${bon.sandbox ? " (TEST SumUp sandbox)" : ""}</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 14px;">
        ${row("Offre", `${escHtml(bon.offre_label)} · ${euros(bon.montant)}`)}
        ${row("Code", `<strong>${escHtml(bon.code)}</strong>`)}
        ${row("Acheteur", `${escHtml(bon.acheteur_nom)}${bon.acheteur_email ? ` (<a href="mailto:${escHtml(bon.acheteur_email)}">${escHtml(bon.acheteur_email)}</a>)` : ""}`)}
        ${row("Bénéficiaire", escHtml(bon.beneficiaire_nom))}
        ${row("Paiement", bon.mode_paiement === "comptoir" ? "Au comptoir" : `En ligne (SumUp ${escHtml(bon.sumup_transaction_code)})`)}
        ${row("Valable jusqu'au", escHtml(dateFr(bon.expire_le)))}
      </table>
      <p style="margin-top: 16px;"><a href="https://vr-cafe.fr/admin/bons" style="color: #7c3aed;">Voir les bons cadeaux</a></p>
    </div>
  `;
  return { subject: `[Bon cadeau] ${bon.offre_label} · ${euros(bon.montant)} · ${bon.acheteur_nom}`, html };
}

export async function sendBonClientEmail(bon: Bon, creds: MailjetCreds): Promise<void> {
  if (!bon.acheteur_email) return;
  const { subject, html } = bonClientEmail(bon);
  const mailjet = new Mailjet({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
  await mailjet.post("send", { version: "v3.1" }).request({
    Messages: [{
      From: { Email: creds.senderEmail, Name: "VR Café" },
      To: [{ Email: bon.acheteur_email, Name: bon.acheteur_nom }],
      Subject: subject,
      HTMLPart: html,
    }],
  });
}

export async function sendBonAdminEmail(bon: Bon, creds: MailjetCreds): Promise<void> {
  const { subject, html } = bonAdminEmail(bon);
  const mailjet = new Mailjet({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
  await mailjet.post("send", { version: "v3.1" }).request({
    Messages: [{
      From: { Email: creds.senderEmail, Name: "VR Café" },
      To: [{ Email: ADMIN_EMAIL, Name: "VR Café Admin" }],
      Subject: subject,
      HTMLPart: html,
      ...(bon.acheteur_email ? { ReplyTo: { Email: bon.acheteur_email, Name: bon.acheteur_nom } } : {}),
    }],
  });
}

/** Avis à l'admin : remboursement détecté chez SumUp (total → bon annulé, partiel → bon gardé). */
export function bonRefundAdminEmail(bon: Bon, rembourse: number, total: boolean): { subject: string; html: string } {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${total ? "#dc2626" : "#d97706"};">${total ? "↩️ Bon cadeau remboursé : annulé" : "⚠️ Bon cadeau remboursé en partie"}</h2>
      <p style="font-size: 14px; color: #1e293b;">
        Le paiement SumUp du bon <strong>${escHtml(bon.code)}</strong> (${escHtml(bon.offre_label)}, ${euros(bon.montant)})
        a été remboursé à hauteur de <strong>${euros(rembourse)}</strong>.
      </p>
      <p style="font-size: 14px; color: #1e293b;">
        ${total
          ? "Le bon a été <strong>annulé</strong> : il ne peut plus être utilisé."
          : "Le bon est <strong>toujours valide</strong>. Annulez-le dans l'admin si le client ne doit plus l'utiliser."}
      </p>
      <p style="font-size: 14px; color: #64748b;">Acheteur : ${escHtml(bon.acheteur_nom)}${bon.acheteur_email ? ` (${escHtml(bon.acheteur_email)})` : ""} · Bénéficiaire : ${escHtml(bon.beneficiaire_nom)}</p>
      <p style="margin-top: 16px;"><a href="https://vr-cafe.fr/admin/bons?q=${encodeURIComponent(bon.code ?? "")}" style="color: #7c3aed;">Voir le bon</a></p>
    </div>
  `;
  return { subject: `[Bon cadeau] ${total ? "Remboursé et annulé" : "Remboursement partiel"} · ${bon.code} · ${euros(rembourse)}`, html };
}

export async function sendBonRefundAdminEmail(bon: Bon, rembourse: number, total: boolean, creds: MailjetCreds): Promise<void> {
  const { subject, html } = bonRefundAdminEmail(bon, rembourse, total);
  const mailjet = new Mailjet({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
  await mailjet.post("send", { version: "v3.1" }).request({
    Messages: [{
      From: { Email: creds.senderEmail, Name: "VR Café" },
      To: [{ Email: ADMIN_EMAIL, Name: "VR Café Admin" }],
      Subject: subject,
      HTMLPart: html,
    }],
  });
}
