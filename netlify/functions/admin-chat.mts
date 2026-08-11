// Chat d'aide opérationnelle pour les collaborateurs (onglet /admin/aide).
// Même pattern d'auth / routage / réponse que admin-db.mts et admin-avis.mts
// pour rester cohérent avec le reste du back-office.

import type { Context, Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import { STAFF_GUIDE } from "../lib/staff-guide-content.generated.ts";

const QUESTION_MIN_LENGTH = 2;
const QUESTION_MAX_LENGTH = 500;

function checkAuth(req: Request): boolean {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  const sessionValue = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;
  return !!adminPassword && sessionValue === adminPassword;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getEnv(key: string): string | undefined {
  try {
    return Netlify.env.get(key);
  } catch {
    /* hors contexte Netlify */
  }
  return process.env[key];
}

// Instructions système : le modèle ne doit répondre qu'à partir du contenu du guide.
const SYSTEM_PROMPT = `Tu es l'assistant opérationnel de VR Café (Canet-en-Roussillon), à destination des collaborateurs.
Réponds UNIQUEMENT à partir de la documentation ci-dessous. Si l'information n'y figure pas,
dis-le clairement et invite la personne à demander à Sandro plutôt que d'inventer une réponse.
Sois concis, en français, et donne des étapes numérotées quand c'est pertinent.

--- DOCUMENTATION ---
${STAFF_GUIDE}
--- FIN DOCUMENTATION ---`;

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!checkAuth(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < QUESTION_MIN_LENGTH || question.length > QUESTION_MAX_LENGTH) {
    return json(
      { error: `Question invalide (entre ${QUESTION_MIN_LENGTH} et ${QUESTION_MAX_LENGTH} caractères)` },
      400,
    );
  }

  try {
    const client = new Anthropic({ apiKey: getEnv("ANTHROPIC_API_KEY") });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: question }],
    });

    const answer = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return json({ answer });
  } catch (err) {
    console.error("Erreur admin-chat:", err);
    return json({ error: "Erreur serveur" }, 500);
  }
};

export const config: Config = {
  path: "/api/admin/chat",
};

