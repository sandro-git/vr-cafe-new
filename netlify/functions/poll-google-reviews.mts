// Poller des avis Google Business Profile — détecte les nouveaux avis,
// génère un brouillon de réponse (Claude Haiku 4.5) et les insère en base
// avec le statut "en_attente" pour validation manuelle dans /admin/avis.
//
// `schedule` et `path` sont mutuellement exclusifs sur le type Config Netlify :
// cette fonction ne peut donc pas être appelée directement en HTTP. La logique
// est exposée via runPoll() et réutilisée par l'action "poll_reviews_now" de
// admin-avis.mts (déclenchement manuel — nécessaire aussi car un @hourly ne
// se déclenche pas dans netlify dev).

import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { listReviews } from "../lib/google-business.ts";
import { generateDraftReply } from "../lib/generate-review-reply.ts";
import { notifyNewReservation } from "../../src/lib/notify.js";

function getEnv(key: string): string | undefined {
  try {
    return Netlify.env.get(key);
  } catch {
    /* hors contexte Netlify */
  }
  return process.env[key];
}

function getSupabase() {
  return createClient(
    getEnv("PUBLIC_SUPABASE_URL")!,
    getEnv("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export interface PollResult {
  nouveauxAvis: number;
  erreurs: string[];
}

export async function runPoll(): Promise<PollResult> {
  const supabase = getSupabase();
  const erreurs: string[] = [];

  const reviews = await listReviews();

  const { data: existing, error: selectError } = await supabase
    .from("avis_google")
    .select("google_review_id");

  if (selectError) {
    throw new Error(`Lecture Supabase échouée : ${selectError.message}`);
  }

  const existingIds = new Set((existing ?? []).map((r) => r.google_review_id));

  const nouveaux = reviews.filter(
    (r) => !existingIds.has(r.reviewId) && !r.hasExistingReply,
  );

  let nouveauxAvis = 0;

  for (const review of nouveaux) {
    let brouillon = "";
    try {
      brouillon = await generateDraftReply({
        reviewerName: review.reviewerName,
        starRating: review.starRating,
        comment: review.comment,
      });
    } catch (err) {
      erreurs.push(
        `Génération brouillon échouée pour ${review.reviewId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const { error: insertError } = await supabase.from("avis_google").insert({
      google_review_id: review.reviewId,
      auteur_nom: review.reviewerName,
      auteur_photo_url: review.reviewerPhotoUrl,
      note: review.starRating,
      commentaire: review.comment,
      date_avis: review.createTime,
      date_modification_avis: review.updateTime,
      brouillon_reponse: brouillon,
      statut: "en_attente",
    });

    if (insertError) {
      erreurs.push(`Insertion échouée pour ${review.reviewId}: ${insertError.message}`);
      continue;
    }

    nouveauxAvis += 1;
  }

  if (nouveauxAvis > 0) {
    try {
      await notifyNewReservation({
        title: nouveauxAvis === 1 ? "Nouvel avis Google" : `${nouveauxAvis} nouveaux avis Google`,
        body: "Un brouillon de réponse a été généré, à valider dans le dashboard.",
        url: "/admin/avis",
      });
    } catch (err) {
      console.error("Notification push avis Google échouée:", err);
    }
  }

  if (erreurs.length) {
    console.error("Erreurs poll-google-reviews:", erreurs);
  }

  return { nouveauxAvis, erreurs };
}

export default async () => {
  try {
    const result = await runPoll();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("poll-google-reviews error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

export const config: Config = {
  schedule: "@hourly",
};
