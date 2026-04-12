import type { Context, Config } from "@netlify/functions";
import Mailjet from "node-mailjet";

const ALLOWED_ORIGINS = [
  "https://vr-cafe.fr",
  "https://www.vr-cafe.fr",
  "http://localhost:4321",
];

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

async function verifyCsrf(token: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const window5m = Math.floor(Date.now() / 300000);
  // Accepter la fenêtre courante et la précédente (pour éviter les refus en bord de fenêtre)
  for (const w of [window5m, window5m - 1]) {
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(w)));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    if (token === expected) return true;
  }
  return false;
}

export default async (req: Request, context: Context) => {
  // Vérifier que c'est une requête POST
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

  try {
    // Récupérer les données du formulaire
    const formData = await req.formData();
    const email = formData.get("email") as string;
    const subject = formData.get("subject") as string;
    const message = formData.get("message") as string;
    const botField = formData.get("bot-field") as string;
    const csrfToken = formData.get("_csrf") as string;

    // Protection anti-spam honeypot
    if (botField) {
      console.log("Bot detected via honeypot");
      const url = new URL("/contact/merci", req.url);
      return Response.redirect(url.toString(), 303);
    }

    // Validation CSRF
    const csrfSecret = Netlify.env.get("ADMIN_PASSWORD") || process.env.ADMIN_PASSWORD || "vrcafe-csrf-fallback";
    if (!csrfToken || !(await verifyCsrf(csrfToken, csrfSecret))) {
      return new Response(
        JSON.stringify({ error: "Invalid CSRF token" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validation
    if (!email || !subject || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Initialiser Mailjet avec les variables d'environnement
    // Netlify.env.get() en priorité pour production, process.env pour dev local
    const apiKey = Netlify.env.get("MAILJET_API_KEY") || process.env.MAILJET_API_KEY;
    const apiSecret = Netlify.env.get("MAILJET_API_SECRET") || process.env.MAILJET_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error("Missing Mailjet credentials");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const mailjet = new Mailjet({
      apiKey,
      apiSecret,
    });

    // Envoyer l'email via Mailjet
    const request = mailjet.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: {
            Email: Netlify.env.get("MAILJET_SENDER_EMAIL") || process.env.MAILJET_SENDER_EMAIL || "contact@vr-cafe.fr",
            Name: "VR Café - Formulaire de contact",
          },
          To: [
            {
              Email: "sandro@vr-cafe.fr",
              Name: "VR Café",
            },
          ],
          Subject: `[Contact VR Café] ${subject}`,
          TextPart: `Nouveau message de contact\n\nDe : ${email}\nSujet : ${subject}\n\nMessage :\n${message}`,
          HTMLPart: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">Nouveau message de contact</h2>
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>De :</strong> ${escHtml(email)}</p>
                <p><strong>Sujet :</strong> ${escHtml(subject)}</p>
              </div>
              <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h3 style="color: #374151; margin-top: 0;">Message :</h3>
                <p style="color: #4b5563; line-height: 1.6;">${escHtml(message).replace(/\n/g, '<br>')}</p>
              </div>
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
                <p>Ce message a été envoyé depuis le formulaire de contact du site VR Café.</p>
              </div>
            </div>
          `,
          ReplyTo: {
            Email: email,
          },
        },
      ],
    });

    await request;

    console.log(`Email sent successfully from ${email}`);

    // Rediriger vers la page de confirmation
    const redirectUrl = new URL("/contact/merci", req.url);
    return Response.redirect(redirectUrl.toString(), 303);

  } catch (error) {
    console.error("Error sending email:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to send email",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/contact",
};
