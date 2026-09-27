import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REFRESH_TOKEN: "refresh",
  GBP_ACCOUNT_ID: "123",
  GBP_LOCATION_ID: "456",
};

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function mockFetch(route: Route) {
  fetchMock = vi.fn((input: string | URL, init?: RequestInit) => Promise.resolve(route(String(input), init)));
  vi.stubGlobal("fetch", fetchMock);
}

const tokenOk: Route = (url) => (url.startsWith("https://oauth2.googleapis.com/token") ? json({ access_token: "tok", expires_in: 3600 }) : undefined!);

// Le module garde le jeton OAuth en cache : on le recharge à chaque test
async function load() {
  vi.resetModules();
  return import("../netlify/lib/google-business");
}

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("listReviews", () => {
  it("convertit les avis de l'API (note en chiffres, valeurs par défaut)", async () => {
    mockFetch((url) =>
      tokenOk(url) ??
      json({
        reviews: [
          {
            reviewId: "r1",
            reviewer: { displayName: "Alice", profilePhotoUrl: "https://photo" },
            starRating: "FIVE",
            comment: "Top",
            createTime: "2026-09-01T10:00:00Z",
            updateTime: "2026-09-01T10:00:00Z",
            reviewReply: { comment: "Merci" },
          },
          { reviewId: "r2", createTime: "c", updateTime: "u" },
          { reviewId: "r3", starRating: "TWO", createTime: "c", updateTime: "u" },
        ],
      }),
    );
    const { listReviews } = await load();
    const reviews = await listReviews();
    expect(reviews[0]).toEqual({
      reviewId: "r1",
      reviewerName: "Alice",
      reviewerPhotoUrl: "https://photo",
      starRating: 5,
      comment: "Top",
      createTime: "2026-09-01T10:00:00Z",
      updateTime: "2026-09-01T10:00:00Z",
      hasExistingReply: true,
    });
    expect(reviews[1]).toMatchObject({ reviewerName: "Client", reviewerPhotoUrl: null, starRating: 0, comment: "", hasExistingReply: false });
    expect(reviews[2].starRating).toBe(2);
  });

  it("convertit toutes les notes de ONE à FIVE, 0 si inconnue", async () => {
    const ratings = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "STAR_RATING_UNSPECIFIED"];
    mockFetch((url) =>
      tokenOk(url) ?? json({ reviews: ratings.map((starRating, i) => ({ reviewId: `r${i}`, starRating, createTime: "", updateTime: "" })) }),
    );
    const { listReviews } = await load();
    expect((await listReviews()).map((r) => r.starRating)).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it("suit la pagination et appelle le bon établissement avec le jeton", async () => {
    mockFetch((url) => {
      if (tokenOk(url)) return tokenOk(url);
      const page = new URL(url).searchParams.get("pageToken");
      return page === "p2"
        ? json({ reviews: [{ reviewId: "b", createTime: "", updateTime: "" }] })
        : json({ reviews: [{ reviewId: "a", createTime: "", updateTime: "" }], nextPageToken: "p2" });
    });
    const { listReviews } = await load();
    const reviews = await listReviews();
    expect(reviews.map((r) => r.reviewId)).toEqual(["a", "b"]);

    const apiCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes("mybusiness"));
    expect(apiCalls).toHaveLength(2);
    expect(String(apiCalls[0][0])).toBe("https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews");
    expect((apiCalls[0][1] as RequestInit).headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("le jeton OAuth est rafraîchi une seule fois puis gardé en cache", async () => {
    mockFetch((url) => tokenOk(url) ?? json({ reviews: [] }));
    const { listReviews } = await load();
    await listReviews();
    await listReviews();
    const tokenCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes("oauth2"));
    expect(tokenCalls).toHaveLength(1);
    const body = (tokenCalls[0][1] as RequestInit).body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh");
  });

  it("jeton expiré : nouveau refresh", async () => {
    mockFetch((url) => (url.includes("oauth2") ? json({ access_token: "tok", expires_in: 30 }) : json({ reviews: [] })));
    const { listReviews } = await load();
    await listReviews();
    await listReviews(); // expires_in - 60s de marge < 0 → déjà expiré
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("oauth2"))).toHaveLength(2);
  });

  it("erreur explicite si le refresh OAuth échoue", async () => {
    mockFetch(() => new Response("invalid_grant", { status: 400 }));
    const { listReviews } = await load();
    await expect(listReviews()).rejects.toThrow("Échec du refresh OAuth Google (400) : invalid_grant");
  });

  it("erreur explicite si l'API des avis échoue", async () => {
    mockFetch((url) => tokenOk(url) ?? new Response("forbidden", { status: 403 }));
    const { listReviews } = await load();
    await expect(listReviews()).rejects.toThrow("Échec de listReviews Google (403) : forbidden");
  });

  it("variable d'environnement manquante : erreur nommée, aucun appel réseau", async () => {
    vi.stubEnv("GOOGLE_REFRESH_TOKEN", "");
    mockFetch(() => json({}));
    const { listReviews } = await load();
    await expect(listReviews()).rejects.toThrow("Variable d'environnement manquante : GOOGLE_REFRESH_TOKEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("replyToReview", () => {
  it("PUT de la réponse sur l'avis", async () => {
    mockFetch((url) => tokenOk(url) ?? json({}));
    const { replyToReview } = await load();
    await replyToReview("r1", "Merci Alice !");
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(String(url)).toBe("https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews/r1/reply");
    expect(init).toMatchObject({ method: "PUT", body: JSON.stringify({ comment: "Merci Alice !" }) });
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("erreur explicite si Google refuse", async () => {
    mockFetch((url) => tokenOk(url) ?? new Response("bad", { status: 400 }));
    const { replyToReview } = await load();
    await expect(replyToReview("r1", "x")).rejects.toThrow("Google a rejeté la réponse (400) : bad");
  });
});
