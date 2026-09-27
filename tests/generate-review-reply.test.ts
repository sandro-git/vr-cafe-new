import { beforeEach, describe, expect, it, vi } from "vitest";

const anthropic = vi.hoisted(() => ({
  apiKey: undefined as string | undefined,
  lastRequest: undefined as any,
  content: [] as any[],
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(opts: { apiKey?: string }) {
      anthropic.apiKey = opts.apiKey;
    }
    messages = {
      create: async (req: any) => {
        anthropic.lastRequest = req;
        return { content: anthropic.content };
      },
    };
  },
}));

import { generateDraftReply } from "../netlify/lib/generate-review-reply";

beforeEach(() => {
  anthropic.content = [{ type: "text", text: "  Merci Alice pour votre visite au VR Café !  " }];
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
});

describe("generateDraftReply", () => {
  it("appelle Claude Haiku avec la clé d'environnement et renvoie le texte nettoyé", async () => {
    const reply = await generateDraftReply({ reviewerName: "Alice", starRating: 5, comment: "Génial" });
    expect(reply).toBe("Merci Alice pour votre visite au VR Café !");
    expect(anthropic.apiKey).toBe("sk-test");
    expect(anthropic.lastRequest.model).toBe("claude-haiku-4-5");
    expect(anthropic.lastRequest.system).toContain("VR Café");
  });

  it("message : nom, note et commentaire nettoyé", async () => {
    await generateDraftReply({ reviewerName: "Alice", starRating: 4, comment: "  Super soirée  " });
    expect(anthropic.lastRequest.messages).toEqual([
      { role: "user", content: 'Avis de Alice — note 4/5.\nCommentaire : "Super soirée"' },
    ]);
  });

  it("note seule quand le commentaire est absent ou vide", async () => {
    await generateDraftReply({ reviewerName: "Bob", starRating: 2 });
    expect(anthropic.lastRequest.messages[0].content).toBe("Avis de Bob — note 2/5.\n(aucun commentaire, note seule)");
    await generateDraftReply({ reviewerName: "Bob", starRating: 2, comment: "   " });
    expect(anthropic.lastRequest.messages[0].content).toContain("(aucun commentaire, note seule)");
  });

  it("réponse sans bloc texte : chaîne vide", async () => {
    anthropic.content = [];
    expect(await generateDraftReply({ reviewerName: "Bob", starRating: 5 })).toBe("");
  });
});
