// Client REST minimal pour l'API Google Business Profile (legacy v4,
// mybusiness.googleapis.com) — liste des avis + publication de réponses.
// Auth OAuth2 via un refresh_token obtenu une fois manuellement (voir plan) ;
// pas de dépendance npm googleapis, un simple fetch() suffit pour ces deux
// endpoints.

function getEnv(key: string): string | undefined {
  try {
    return Netlify.env.get(key);
  } catch {
    /* hors contexte Netlify (tests, script local) */
  }
  return process.env[key];
}

function requireEnv(key: string): string {
  const value = getEnv(key);
  if (!value) throw new Error(`Variable d'environnement manquante : ${key}`);
  return value;
}

// Cache mémoire in-process — évite un refresh à chaque appel dans une même
// instance de fonction ; les fonctions Netlify étant stateless entre cold
// starts, le pire cas reste un refresh par invocation, ce qui est acceptable
// (aucun coût, l'endpoint OAuth n'est pas rate-limité pour ce volume).
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }

  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const refreshToken = requireEnv("GOOGLE_REFRESH_TOKEN");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Échec du refresh OAuth Google (${res.status}) : ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };

  // Marge de sécurité de 60s avant l'expiration réelle
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedAccessToken.token;
}

const STAR_RATING_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export interface GoogleReview {
  reviewId: string;
  reviewerName: string;
  reviewerPhotoUrl: string | null;
  starRating: number;
  comment: string;
  createTime: string;
  updateTime: string;
  hasExistingReply: boolean;
}

interface GbpReviewApi {
  reviewId: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  starRating?: string;
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

function locationPath(): string {
  const accountId = requireEnv("GBP_ACCOUNT_ID");
  const locationId = requireEnv("GBP_LOCATION_ID");
  return `accounts/${accountId}/locations/${locationId}`;
}

/** Liste tous les avis Google du point de vente (pagination suivie automatiquement). */
export async function listReviews(): Promise<GoogleReview[]> {
  const accessToken = await getAccessToken();
  const reviews: GoogleReview[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://mybusiness.googleapis.com/v4/${locationPath()}/reviews`,
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Échec de listReviews Google (${res.status}) : ${text}`);
    }

    const data = (await res.json()) as {
      reviews?: GbpReviewApi[];
      nextPageToken?: string;
    };

    for (const r of data.reviews ?? []) {
      reviews.push({
        reviewId: r.reviewId,
        reviewerName: r.reviewer?.displayName ?? "Client",
        reviewerPhotoUrl: r.reviewer?.profilePhotoUrl ?? null,
        starRating: r.starRating ? (STAR_RATING_MAP[r.starRating] ?? 0) : 0,
        comment: r.comment ?? "",
        createTime: r.createTime,
        updateTime: r.updateTime,
        hasExistingReply: !!r.reviewReply,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return reviews;
}

/** Publie (ou remplace) la réponse du commerçant à un avis Google. */
export async function replyToReview(
  reviewId: string,
  comment: string,
): Promise<void> {
  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${locationPath()}/reviews/${reviewId}/reply`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google a rejeté la réponse (${res.status}) : ${text}`);
  }
}
