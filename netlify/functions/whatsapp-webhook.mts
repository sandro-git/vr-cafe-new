import type { Context, Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ---- Base de connaissance ----
function readKnowledge(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(__dirname, "../../content/vr-cafe-knowledge.md"), "utf-8");
}

// ---- Tools ----
const tools: Anthropic.Tool[] = [
  {
    name: "get_knowledge",
    description: "Retourne toutes les informations du VR Café : tarifs, horaires et FAQ",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

function executeTool(name: string, _input: Record<string, string>): string {
  if (name === "get_knowledge") return readKnowledge();
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
      system: "Tu es l'assistant du VR Café. Utilise le tool get_knowledge pour accéder aux informations (tarifs, horaires, FAQ) avant de répondre aux questions des clients. Ne jamais inventer d'informations. Réponds de manière courte et amicale, adapté à WhatsApp.",
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
