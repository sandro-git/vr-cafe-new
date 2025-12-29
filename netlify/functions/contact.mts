import type { Context, Config } from "@netlify/functions";
import Mailjet from "node-mailjet";

export default async (req: Request, context: Context) => {
  // Vérifier que c'est une requête POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Récupérer les données du formulaire
    const formData = await req.formData();
    const email = formData.get("email") as string;
    const subject = formData.get("subject") as string;
    const message = formData.get("message") as string;
    const botField = formData.get("bot-field") as string;

    // Protection anti-spam honeypot
    if (botField) {
      console.log("Bot detected via honeypot");
      const url = new URL("/contact/merci", req.url);
      return Response.redirect(url.toString(), 303);
    }

    // Validation
    if (!email || !subject || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Initialiser Mailjet avec les variables d'environnement
    // Utiliser process.env pour compatibilité dev local et production
    const apiKey = process.env.MAILJET_API_KEY || Netlify.env.get("MAILJET_API_KEY");
    const apiSecret = process.env.MAILJET_API_SECRET || Netlify.env.get("MAILJET_API_SECRET");

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
            Email: process.env.MAILJET_SENDER_EMAIL || Netlify.env.get("MAILJET_SENDER_EMAIL") || "noreply@vr-cafe.fr",
            Name: "VR Café - Formulaire de contact",
          },
          To: [
            {
              Email: "contact@vr-cafe.fr",
              Name: "VR Café",
            },
          ],
          Subject: `[Contact VR Café] ${subject}`,
          TextPart: `Nouveau message de contact\n\nDe : ${email}\nSujet : ${subject}\n\nMessage :\n${message}`,
          HTMLPart: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">Nouveau message de contact</h2>
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>De :</strong> ${email}</p>
                <p><strong>Sujet :</strong> ${subject}</p>
              </div>
              <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h3 style="color: #374151; margin-top: 0;">Message :</h3>
                <p style="color: #4b5563; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</p>
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
