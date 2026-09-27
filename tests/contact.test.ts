import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, FakeMailjet } = await vi.hoisted(async () => {
  const { createMailjetMock } = await import("./helpers/mailjet-mock");
  return createMailjetMock();
});
vi.mock("node-mailjet", () => ({ default: FakeMailjet }));

import contact from "../netlify/functions/contact.mts";
import contactToken from "../netlify/functions/contact-token.mts";

const T0 = Date.parse("2026-09-27T20:00:00Z");
const ORIGIN = "https://vr-cafe.fr";

/** Jeton émis par la vraie fonction contact-token à l'instant `at`. */
async function token(at = T0) {
  vi.setSystemTime(at);
  const res = await (contactToken as () => Promise<Response>)();
  return (await res.json()) as { csrf: string; ts: string };
}

async function send(
  fields: Record<string, string>,
  { at = T0 + 10_000, origin = ORIGIN as string | null, method = "POST" } = {},
) {
  vi.setSystemTime(at);
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  const req = new Request("https://vr-cafe.fr/api/contact", method === "POST" ? { method, headers, body } : { method, headers });
  const res = await contact(req, {} as any);
  return { status: res.status, location: res.headers.get("location"), text: await res.text() };
}

async function validFields(over: Record<string, string> = {}) {
  const { csrf, ts } = await token();
  return { email: "client@gmail.com", subject: "Anniversaire", message: "Bonjour,\nune question.", _csrf: csrf, _ts: ts, ...over };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  state.calls.length = 0;
  state.respond = () => ({ body: {} });
  vi.stubEnv("ADMIN_PASSWORD", "secret-csrf-test");
  vi.stubEnv("MAILJET_API_KEY", "k");
  vi.stubEnv("MAILJET_API_SECRET", "s");
  vi.stubEnv("MAILJET_SENDER_EMAIL", "contact@vr-cafe.fr");
  // Les fonctions lisent Netlify.env : on le branche sur process.env
  vi.stubGlobal("Netlify", { env: { get: (k: string) => process.env[k] } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("contact : envoi valide", () => {
  it("email à l'admin, réponse au visiteur, redirection vers /contact/merci", async () => {
    const res = await send(await validFields());
    expect(res.status).toBe(303);
    expect(res.location).toBe("https://vr-cafe.fr/contact/merci");

    expect(state.calls).toHaveLength(1);
    const msg = state.calls[0].body.Messages[0];
    expect(msg.To).toEqual([{ Email: "sandro@vr-cafe.fr", Name: "VR Café" }]);
    expect(msg.From.Email).toBe("contact@vr-cafe.fr");
    expect(msg.ReplyTo).toEqual({ Email: "client@gmail.com" });
    expect(msg.Subject).toBe("[Contact VR Café] Anniversaire");
    // Un formulaire envoie les retours à la ligne en \r\n (comme un <textarea> de navigateur)
    expect(msg.HTMLPart).toMatch(/Bonjour,\r?<br>une question\./);
  });

  it("échappe le HTML saisi par le visiteur", async () => {
    await send(await validFields({ subject: "<b>x</b>", message: '<script>alert("x")</script>' }));
    const html = state.calls[0].body.Messages[0].HTMLPart;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("jeton de 59 min encore accepté", async () => {
    const res = await send(await validFields(), { at: T0 + 59 * 60_000 });
    expect(res.status).toBe(303);
    expect(state.calls).toHaveLength(1);
  });
});

describe("contact : jeton CSRF", () => {
  const cases: [string, (f: Record<string, string>) => Record<string, string>][] = [
    ["modifié d'un caractère", (f) => ({ ...f, _csrf: (f._csrf[0] === "A" ? "B" : "A") + f._csrf.slice(1) })],
    ["tronqué", (f) => ({ ...f, _csrf: f._csrf.slice(0, -4) })],
    ["pas du base64", (f) => ({ ...f, _csrf: "%%%pas-du-base64%%%" })],
    ["absent", (f) => ({ ...f, _csrf: "" })],
    ["horodatage changé", (f) => ({ ...f, _ts: String(Number(f._ts) - 1000) })],
  ];
  for (const [nom, alter] of cases) {
    it(`${nom} → 403, aucun email`, async () => {
      const res = await send(alter(await validFields()));
      expect(res.status).toBe(403);
      expect(state.calls).toEqual([]);
    });
  }

  it("expiré (> 1 h) → 403", async () => {
    const res = await send(await validFields(), { at: T0 + 61 * 60_000 });
    expect(res.status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it("signé avec un autre secret → 403", async () => {
    const fields = await validFields();
    vi.stubEnv("ADMIN_PASSWORD", "autre-secret");
    expect((await send(fields)).status).toBe(403);
  });
});

describe("contact : anti-robots et requêtes invalides", () => {
  it("Origin absente ou étrangère → 403", async () => {
    expect((await send(await validFields(), { origin: null })).status).toBe(403);
    expect((await send(await validFields(), { origin: "https://evil.example" })).status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it("piège à robots rempli → redirection silencieuse, aucun email", async () => {
    const res = await send(await validFields({ website: "http://spam" }));
    expect([res.status, res.location]).toEqual([303, "https://vr-cafe.fr/contact/merci"]);
    expect(state.calls).toEqual([]);
  });

  it("envoi en moins de 3 s → redirection silencieuse, aucun email", async () => {
    const res = await send(await validFields(), { at: T0 + 2_000 });
    expect(res.status).toBe(303);
    expect(state.calls).toEqual([]);
  });

  it("champ manquant → 400", async () => {
    const res = await send(await validFields({ message: "" }));
    expect(res.status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("autre méthode que POST → 405", async () => {
    expect((await send({}, { method: "GET" })).status).toBe(405);
  });
});

describe("contact : erreur d'envoi", () => {
  it("500 sans détail technique pour le visiteur, détail dans les journaux", async () => {
    state.respond = () => {
      throw new Error("Mailjet: API key invalide (compte 12345)");
    };
    const res = await send(await validFields());
    expect(res.status).toBe(500);
    expect(JSON.parse(res.text)).toEqual({ error: "Failed to send email" });
    expect(res.text).not.toContain("Mailjet");
    expect(console.error).toHaveBeenCalledWith("Error sending email:", expect.any(Error));
  });
});
