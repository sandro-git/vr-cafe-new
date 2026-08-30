// supabase/functions/send-prospection/index.ts
//
// Edge Function Deno native. Reçoit un tableau d'IDs de contacts
// `prospection`, envoie un email de relance via l'API REST Brevo (espacés
// de 2-3s), met à jour le statut de chaque contact, et retourne un résumé
// JSON. Résilience par contact : un échec Brevo ou Supabase sur un ID ne
// bloque jamais le traitement des IDs suivants.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function getSupabase() {
  // SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement
  // par la plateforme dans le runtime des Edge Functions.
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceRoleKey);
}

function buildEmail(nom: string | null) {
  const prenom = nom?.trim() || "";
  const subject = "VR Café — une offre spéciale pour vous";
  const htmlContent = `
    <html>
      <body style="font-family: sans-serif; line-height: 1.5;">
        <p>Bonjour${prenom ? " " + prenom : ""},</p>
        <p>
          Nous avons pensé à vous chez VR Café ! Venez découvrir nos
          expériences en réalité virtuelle, entre amis ou en famille.
        </p>
        <p>À très vite,<br>L'équipe VR Café</p>
      </body>
    </html>
  `.trim();
  return { subject, htmlContent };
}

async function sendBrevoEmail(
  contact: { email: string; nom: string | null },
  apiKey: string,
): Promise<void> {
  const { subject, htmlContent } = buildEmail(contact.nom);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "VR Café", email: "contact@vr-cafe.fr" },
      to: [{ email: contact.email, name: contact.nom ?? undefined }],
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Brevo ${response.status}: ${detail || response.statusText}`);
  }
}

function delay(): Promise<void> {
  // Espacement 2-3s, légèrement variable pour éviter un pattern d'envoi
  // trop mécanique.
  const ms = 2000 + Math.random() * 1000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((v): v is string => typeof v === "string" && v.length > 0))]
    : [];

  if (!ids.length) {
    return json({ error: "Missing or empty ids array" }, 400);
  }

  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoApiKey) {
    return json({ error: "Missing BREVO_API_KEY secret" }, 500);
  }

  let supabase: ReturnType<typeof getSupabase>;
  try {
    supabase = getSupabase();
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  const succes: string[] = [];
  const echecs: { id: string; erreur: string }[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    // 1. Récupération du contact — erreur locale, n'interrompt pas la boucle
    const { data: contact, error: fetchError } = await supabase
      .from("prospection")
      .select("id, nom, email")
      .eq("id", id)
      .single();

    if (fetchError || !contact) {
      echecs.push({ id, erreur: fetchError?.message ?? "Contact introuvable" });
      continue;
    }

    // 2. Envoi Brevo — erreur locale, résilience par contact
    try {
      await sendBrevoEmail(
        { email: contact.email as string, nom: contact.nom as string | null },
        brevoApiKey,
      );

      const { error: updateError } = await supabase
        .from("prospection")
        .update({
          statut: "relance_envoyee",
          date_envoi: new Date().toISOString(),
          erreur: null,
        })
        .eq("id", id);

      if (updateError) {
        console.error(`Update statut échoué (email pourtant envoyé) pour ${id}:`, updateError.message);
        echecs.push({ id, erreur: `Email envoyé mais échec de mise à jour du statut: ${updateError.message}` });
      } else {
        succes.push(id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Échec envoi Brevo pour ${id}:`, message);

      const { error: updateError } = await supabase
        .from("prospection")
        .update({ statut: "erreur_envoi", erreur: message })
        .eq("id", id);

      if (updateError) {
        console.error(`Échec mise à jour statut erreur pour ${id}:`, updateError.message);
      }

      echecs.push({ id, erreur: message });
    }

    // 3. Délai avant le contact suivant (pas après le dernier)
    if (i < ids.length - 1) {
      await delay();
    }
  }

  return json({ total: ids.length, succes, echecs });
});
