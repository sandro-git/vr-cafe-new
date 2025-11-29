import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const handler = async (event) => {
  // Autoriser uniquement les requêtes POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée' }),
    };
  }

  try {
    // Parser les données du formulaire
    const { name, email, phone, subject, message } = JSON.parse(event.body);

    // Validation des champs requis
    if (!name || !email || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Les champs nom, email et message sont obligatoires'
        }),
      };
    }

    // Validation basique de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Adresse email invalide'
        }),
      };
    }

    // Construction du contenu HTML de l'email
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              border-radius: 10px 10px 0 0;
              text-align: center;
            }
            .content {
              background: #f8f9fa;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .field {
              margin-bottom: 20px;
              background: white;
              padding: 15px;
              border-radius: 8px;
              border-left: 4px solid #667eea;
            }
            .label {
              font-weight: bold;
              color: #667eea;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 5px;
            }
            .value {
              color: #333;
              font-size: 15px;
            }
            .message-content {
              background: white;
              padding: 20px;
              border-radius: 8px;
              white-space: pre-wrap;
              word-wrap: break-word;
            }
            .footer {
              text-align: center;
              margin-top: 20px;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">🎮 Nouveau message de contact</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">VR Café Canet-en-Roussillon</p>
          </div>
          <div class="content">
            <div class="field">
              <div class="label">👤 Nom</div>
              <div class="value">${name}</div>
            </div>

            <div class="field">
              <div class="label">✉️ Email</div>
              <div class="value"><a href="mailto:${email}" style="color: #667eea; text-decoration: none;">${email}</a></div>
            </div>

            ${phone ? `
            <div class="field">
              <div class="label">📱 Téléphone</div>
              <div class="value"><a href="tel:${phone}" style="color: #667eea; text-decoration: none;">${phone}</a></div>
            </div>
            ` : ''}

            ${subject ? `
            <div class="field">
              <div class="label">📋 Sujet</div>
              <div class="value">${subject}</div>
            </div>
            ` : ''}

            <div class="field">
              <div class="label">💬 Message</div>
              <div class="message-content">${message}</div>
            </div>

            <div class="footer">
              <p>Message reçu via le formulaire de contact du site VR Café</p>
              <p>Vous pouvez répondre directement à ${email}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Construction du contenu texte brut
    const textContent = `
Nouveau message de contact - VR Café

Nom: ${name}
Email: ${email}
${phone ? `Téléphone: ${phone}` : ''}
${subject ? `Sujet: ${subject}` : ''}

Message:
${message}

---
Message reçu via le formulaire de contact du site VR Café
Vous pouvez répondre directement à ${email}
    `.trim();

    // Envoi de l'email via Resend
    const data = await resend.emails.send({
      from: 'VR Café Contact <onboarding@resend.dev>', // Remplacer par votre domaine vérifié une fois configuré
      to: process.env.CONTACT_EMAIL || 'contact@vr-cafe.fr',
      reply_to: email,
      subject: subject ? `[VR Café] ${subject}` : `[VR Café] Message de ${name}`,
      html: htmlContent,
      text: textContent,
    });

    console.log('Email envoyé avec succès:', data);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        message: 'Votre message a été envoyé avec succès ! Nous vous répondrons dans les plus brefs délais.',
        id: data.id
      }),
    };

  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Une erreur est survenue lors de l\'envoi du message. Veuillez réessayer ou nous contacter directement.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }),
    };
  }
};
