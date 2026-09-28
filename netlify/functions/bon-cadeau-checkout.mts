import type { Context, Config } from "@netlify/functions";
import { validateBonAchat } from "../../src/lib/bons-cadeaux.ts";
import { getBonRepo } from "../lib/bon-repo.ts";
import { SandboxInProductionError, startCheckout } from "../lib/bon-cadeau.ts";
import { readSumUpConfig } from "../lib/sumup.ts";

// Achat d'un bon cadeau depuis /cadeaux : crée le bon « en_attente » et le paiement SumUp,
// renvoie l'URL de la page de paiement hébergée. Le prix vient de l'offre, jamais du navigateur.

const ALLOWED_ORIGINS = [
  "https://vr-cafe.fr",
  "https://www.vr-cafe.fr",
  "http://localhost:4321",
  "http://localhost:8888",
];

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const UNAVAILABLE = "La vente en ligne est momentanément indisponible. Appelez-nous au 06 71 41 06 95 pour commander votre bon.";

/** URL du webhook SumUp : jamais en local (SumUp ne peut pas joindre localhost). */
function webhookUrl(): string | undefined {
  const explicit = getEnv("SUMUP_WEBHOOK_URL");
  if (explicit) return explicit;
  const site = getEnv("URL");
  if (!site || /localhost|127\.0\.0\.1/.test(site)) return undefined;
  return `${site}/api/sumup-webhook`;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: "Forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Piège à robots : champ caché qu'un humain ne remplit pas
  if (body.website) return json({ error: "Forbidden" }, 403);

  const parsed = validateBonAchat(body);
  if (!parsed.ok) return json({ error: "Formulaire incomplet", errors: parsed.errors }, 400);

  const sumup = readSumUpConfig();
  if (!sumup) {
    console.error("bon-cadeau-checkout : SUMUP_API_KEY / SUMUP_MERCHANT_CODE manquants");
    return json({ error: UNAVAILABLE }, 503);
  }

  try {
    const { url } = await startCheckout(getBonRepo(), sumup, parsed.value, {
      origin,
      webhookUrl: webhookUrl(),
      isProduction: getEnv("CONTEXT") === "production",
    });
    return json({ url });
  } catch (err) {
    console.error(err instanceof SandboxInProductionError ? "bon-cadeau-checkout : compte SumUp sandbox en production" : "bon-cadeau-checkout", err);
    return json({ error: UNAVAILABLE }, 502);
  }
};

export const config: Config = {
  path: "/api/bon-cadeau/checkout",
};
