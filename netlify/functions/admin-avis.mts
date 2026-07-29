// API admin dédiée aux avis Google — fichier séparé de admin-db.mts (déjà
// volumineux sur un domaine différent) car ce domaine a ses propres
// intégrations externes (OAuth Google + Anthropic). Même pattern d'auth /
// routage / réponse que admin-db.mts pour rester cohérent avec le reste du
// back-office.

import type { Context, Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { replyToReview } from "../lib/google-business.ts";
import { generateDraftReply } from "../lib/generate-review-reply.ts";
import { runPoll } from "./poll-google-reviews.mts";

function checkAuth(req: Request): boolean {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  const sessionValue = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;
  return !!adminPassword && sessionValue === adminPassword;
}

let _supabase: ReturnType<typeof createClient> | null = null;
// Cast en `any` : le projet n'a pas de type Database généré pour supabase-js,
// et le générique par défaut de .update()/.single() infère `never` sur les
// lignes retournées sans lui — même limitation que dans admin-db.mts.
function getSupabase() {
  return (_supabase ??= createClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )) as any;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

  const { action } = body;

  switch (action) {
    // ── Publier la réponse validée sur Google ───────────────────────────────
    case "publish_review_reply": {
      const { id, texte_final } = body as { id: string; texte_final: string };
      if (!id || !texte_final?.trim()) {
        return json({ error: "Missing id or texte_final" }, 400);
      }

      const { data: avis, error: selErr } = await getSupabase()
        .from("avis_google")
        .select("google_review_id")
        .eq("id", id)
        .single();

      if (selErr || !avis) {
        return json({ error: selErr?.message ?? "Avis introuvable" }, 404);
      }

      try {
        await replyToReview(avis.google_review_id as string, texte_final.trim());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Publication avis Google rejetée:", message);
        const { error: updErr } = await getSupabase()
          .from("avis_google")
          .update({
            brouillon_reponse: texte_final.trim(),
            statut: "rejete",
            erreur_publication: message,
          })
          .eq("id", id);
        if (updErr) return json({ error: updErr.message }, 500);
        return json({ ok: true, statut: "rejete", error: message });
      }

      const { error: updErr } = await getSupabase()
        .from("avis_google")
        .update({
          brouillon_reponse: texte_final.trim(),
          statut: "publie",
          erreur_publication: null,
          date_publication: new Date().toISOString(),
        })
        .eq("id", id);
      if (updErr) return json({ error: updErr.message }, 500);

      return json({ ok: true, statut: "publie" });
    }

    // ── Régénérer le brouillon (retry après rejet) ──────────────────────────
    case "regenerate_draft": {
      const { id } = body as { id: string };
      if (!id) return json({ error: "Missing id" }, 400);

      const { data: avis, error: selErr } = await getSupabase()
        .from("avis_google")
        .select("auteur_nom, note, commentaire")
        .eq("id", id)
        .single();

      if (selErr || !avis) {
        return json({ error: selErr?.message ?? "Avis introuvable" }, 404);
      }

      let brouillon: string;
      try {
        brouillon = await generateDraftReply({
          reviewerName: (avis.auteur_nom as string) ?? "Client",
          starRating: avis.note as number,
          comment: (avis.commentaire as string) ?? undefined,
        });
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : "Génération échouée" },
          500,
        );
      }

      const { error: updErr } = await getSupabase()
        .from("avis_google")
        .update({ brouillon_reponse: brouillon, statut: "en_attente", erreur_publication: null })
        .eq("id", id);
      if (updErr) return json({ error: updErr.message }, 500);

      return json({ ok: true, brouillon_reponse: brouillon });
    }

    // ── Déclenchement manuel du poller ──────────────────────────────────────
    case "poll_reviews_now": {
      try {
        const result = await runPoll();
        return json({ ok: true, ...result });
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : "Poll échoué" },
          500,
        );
      }
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
};

export const config: Config = {
  path: "/api/admin/avis",
};
