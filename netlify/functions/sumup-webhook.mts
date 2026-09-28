import type { Context, Config } from "@netlify/functions";
import { getBonRepo } from "../lib/bon-repo.ts";
import { finalizeBon } from "../lib/bon-cadeau.ts";
import { readSumUpConfig } from "../lib/sumup.ts";

// Webhook SumUp (`return_url` des checkouts) : { event_type: "CHECKOUT_STATUS_CHANGED", id }.
// Non signé par SumUp : on n'utilise que l'id, et finalizeBon relit le paiement via l'API
// avant toute action. Réponse 2xx sauf erreur technique (SumUp retente à 1 min, 5 min, 20 min, 2 h).

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { event_type?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (body.event_type !== "CHECKOUT_STATUS_CHANGED" || typeof body.id !== "string" || body.id.length > 100) {
    return json({ ok: true, ignored: true });
  }

  const sumup = readSumUpConfig();
  if (!sumup) {
    console.error("sumup-webhook : SumUp non configuré");
    return json({ error: "Not configured" }, 503);
  }

  try {
    const repo = getBonRepo();
    const bon = await repo.getByCheckoutId(body.id);
    if (!bon) return json({ ok: true, ignored: true }); // paiement étranger aux bons cadeaux
    const result = await finalizeBon(repo, sumup, bon);
    return json({ ok: true, statut: result.statut });
  } catch (err) {
    console.error("sumup-webhook", err);
    return json({ error: "Server error" }, 500);
  }
};

export const config: Config = {
  path: "/api/sumup-webhook",
};
