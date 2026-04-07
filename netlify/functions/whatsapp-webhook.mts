import type { Context, Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

// ---- Données VR Café ----
const TARIFS = {
  "30min": "18€/personne",
  "1h_1_2_personnes": "29€/personne",
  "1h_3_4_personnes": "27€/personne",
  "1h_5_personnes_et_plus": "25€/personne",
  "anniversaire": "25€/personne",
};

const DISPONIBILITES = {
  vacances: "Ouvert tous les jours de 14h à 22h",
  hors_vacances: "Ouvert mercredi, vendredi, samedi et dimanche de 14h à 22h",
};

const FAQ = {
  age_minimum: "Pas d'âge minimum, mais les moins de 9 ans sont limités à 30 minutes",
  accompagnement_adulte: "Aucun accompagnement adulte obligatoire",
  reservation: "Par téléphone ou sur notre site web",
};

// ---- Tools ----
const tools: Anthropic.Tool[] = [
  {
    name: "get_tarifs",
    description: "Retourne les tarifs du VR Café",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_disponibilites",
    description: "Retourne les créneaux disponibles pour un jour donné",
    input_schema: {
      type: "object",
      properties: {
        jour: { type: "string", description: "Jour de la semaine ex: samedi" },
      },
      required: ["jour"],
    },
  },
  {
    name: "get_faq",
    description: "Retourne les réponses aux questions fréquentes",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

function executeTool(name: string, input: Record<string, string>): string {
  if (name === "get_tarifs") return JSON.stringify(TARIFS);
  if (name === "get_disponibilites") {
    const jour = input.jour?.toLowerCase();
    return JSON.stringify(DISPONIBILITES[jour] ?? { erreur: `Pas d'info pour ${jour}` });
  }
  if (name === "get_faq") return JSON.stringify(FAQ);
  return JSON.stringify({ erreur: "Tool inconnu" });
}

// ---- Agent ----
async function runAgent(question: string): Promise<string> {
  const client = new Anthropic({ apiKey: Netlify.env.get("ANTHROPIC_API_KEY") });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: "Tu es l'assistant du VR Café. Utilise toujours les tools disponibles pour répondre. Ne jamais inventer d'informations. Réponds de manière courte et amicale, adapté à WhatsApp.",
      tools,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: executeTool(block.name, block.input as Record<string, string>),
          });
        }
      }
      messages.push({ role: "user", content: results });
    } else {
      for (const block of response.content) {
        if (block.type === "text") return block.text;
      }
      return "Désolé, je n'ai pas pu répondre.";
    }
  }
}

// ---- Envoi WhatsApp ----
async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const token = Netlify.env.get("WHATSAPP_TOKEN");
  const phoneId = Netlify.env.get("WHATSAPP_PHONE_ID");

  await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    }),
  });
}

// ---- Webhook ----
export default async (req: Request, _context: Context) => {
  // Vérification webhook Meta
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === Netlify.env.get("WEBHOOK_VERIFY_TOKEN")) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // Réception message WhatsApp
  if (req.method === "POST") {
    const body = await req.json();
    const entry = body?.entry?.[0]?.changes?.[0]?.value;
    const message = entry?.messages?.[0];

    if (message?.type === "text") {
      const from = message.from;
      const text = message.text.body;

      const reply = await runAgent(text);
      await sendWhatsAppMessage(from, reply);
    }

    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/whatsapp-webhook",
};
