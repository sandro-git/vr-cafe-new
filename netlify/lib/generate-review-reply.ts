// Génération de brouillons de réponse aux avis Google via Claude Haiku 4.5.
// Modèle volontairement léger : chaque brouillon est relu et édité manuellement
// dans /admin/avis avant publication, et le coût d'un modèle plus capable
// serait de toute façon négligeable au volume d'un café (voir plan).

import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `Tu réponds aux avis Google du VR Café, une salle de réalité
virtuelle à Canet-en-Roussillon, à 10 minutes de Perpignan (escape games VR, jeux
multijoueurs, free roaming).

Rédige une réponse courte (2 à 4 phrases), chaleureuse et professionnelle,
adaptée à la note et au commentaire du client. Mentionne naturellement le nom
du lieu et la ville une seule fois, sans sur-optimisation SEO qui sonnerait
faux — la réponse doit d'abord sembler humaine et sincère.

Pour les avis positifs (4-5 étoiles) : remercie sincèrement, mentionne
éventuellement un élément précis cité par le client.
Pour les avis négatifs (1-3 étoiles) : reste factuel et posé, sans excuses
excessives ni justification défensive, propose de recontacter le client pour
échanger si c'est pertinent.

Ne signe pas la réponse. Réponds uniquement avec le texte de la réponse, sans
guillemets ni préambule.`;

export interface ReviewForDraft {
  reviewerName: string;
  starRating: number;
  comment?: string;
}

function getEnv(key: string): string | undefined {
  try {
    return Netlify.env.get(key);
  } catch {
    /* hors contexte Netlify */
  }
  return process.env[key];
}

export async function generateDraftReply(review: ReviewForDraft): Promise<string> {
  const client = new Anthropic({ apiKey: getEnv("ANTHROPIC_API_KEY") });

  const userContent = `Avis de ${review.reviewerName} — note ${review.starRating}/5.\n${
    review.comment && review.comment.trim()
      ? `Commentaire : "${review.comment.trim()}"`
      : "(aucun commentaire, note seule)"
  }`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
}
