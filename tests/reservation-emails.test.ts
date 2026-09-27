import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, FakeMailjet } = await vi.hoisted(async () => {
  const { createMailjetMock } = await import("./helpers/mailjet-mock");
  return createMailjetMock();
});
vi.mock("node-mailjet", () => ({ default: FakeMailjet }));

import {
  sendCancellationAdminEmail,
  sendCancellationClientEmail,
  type CancellationDetails,
} from "../netlify/lib/reservation-emails";

const creds = { apiKey: "k", apiSecret: "s", senderEmail: "contact@vr-cafe.fr" };

// Samedi 3 octobre 2026, 14:00 – 15:00 à Paris (UTC+2)
const details: CancellationDetails = {
  client_nom: "Sandro TEST",
  client_email: "test@vr-cafe.fr",
  client_telephone: "+33 6 71 41 06 95",
  nb_personnes: 3,
  duree_minutes: 60,
  vr_type: "sans_fil",
  creneau_debut: "2026-10-03T12:00:00Z",
  creneau_fin: "2026-10-03T13:00:00Z",
  box_names: "Box 1, Box 2",
  ref: "305B8767",
  notes: null,
};

const lastMessage = () => state.calls.at(-1)!.body.Messages[0];

beforeEach(() => {
  state.calls.length = 0;
});

describe("sendCancellationAdminEmail", () => {
  it("envoie à l'admin, sujet [Annulation] avec date et heure de Paris", async () => {
    await sendCancellationAdminEmail(details, creds);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toMatchObject({ method: "post", resource: "send", version: "v3.1" });
    const msg = lastMessage();
    expect(msg.To).toEqual([{ Email: "sandro@vr-cafe.fr", Name: "VR Café Admin" }]);
    expect(msg.From).toEqual({ Email: "contact@vr-cafe.fr", Name: "VR Café" });
    expect(msg.Subject).toBe("[Annulation] Sandro TEST · samedi 3 octobre 2026 · 14:00");
  });

  it("contient le détail de la réservation", async () => {
    await sendCancellationAdminEmail(details, creds);
    const html = lastMessage().HTMLPart;
    expect(html).toContain("#305B8767");
    expect(html).toContain("14:00 – 15:00");
    expect(html).toContain("📡 VR Sans Fil");
    expect(html).toContain("Box 1, Box 2");
    expect(html).not.toContain("Notes :");
  });

  it("Reply-To = client, absent si pas d'email", async () => {
    await sendCancellationAdminEmail(details, creds);
    expect(lastMessage().ReplyTo).toEqual({ Email: "test@vr-cafe.fr", Name: "Sandro TEST" });

    await sendCancellationAdminEmail({ ...details, client_email: null }, creds);
    expect(lastMessage()).not.toHaveProperty("ReplyTo");
    expect(lastMessage().HTMLPart).toContain("— (non renseigné)");
  });

  it("échappe le HTML saisi par le client (nom, notes)", async () => {
    await sendCancellationAdminEmail(
      { ...details, client_nom: `<script>alert("x")</script>`, notes: `<img src=x onerror='y'>` },
      creds,
    );
    const html = lastMessage().HTMLPart;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("onerror=&#x27;y&#x27;");
  });

  it("VR filaire", async () => {
    await sendCancellationAdminEmail({ ...details, vr_type: "filaire" }, creds);
    expect(lastMessage().HTMLPart).toContain("🔌 VR Filaire");
  });
});

describe("sendCancellationClientEmail", () => {
  it("n'envoie rien si le client n'a pas d'email", async () => {
    await sendCancellationClientEmail({ ...details, client_email: null }, creds);
    expect(state.calls).toHaveLength(0);
  });

  it("envoie au client avec la référence dans le sujet", async () => {
    await sendCancellationClientEmail(details, creds);
    const msg = lastMessage();
    expect(msg.To).toEqual([{ Email: "test@vr-cafe.fr", Name: "Sandro TEST" }]);
    expect(msg.Subject).toBe("Annulation de votre réservation VR Café - #305B8767");
  });

  it("créneau barré, pluriel des joueurs, bouton pour réserver", async () => {
    await sendCancellationClientEmail(details, creds);
    const html = lastMessage().HTMLPart;
    expect(html).toMatch(/line-through;">samedi 3 octobre 2026</);
    expect(html).toMatch(/line-through;">14:00 – 15:00</);
    expect(html).toContain("3 personnes");
    expect(html).toContain('href="https://vr-cafe.fr/reservation"');

    await sendCancellationClientEmail({ ...details, nb_personnes: 1 }, creds);
    expect(lastMessage().HTMLPart).toContain("1 personne<");
  });

  it("mise en page compatible Gmail : pas de flexbox", async () => {
    await sendCancellationClientEmail(details, creds);
    await sendCancellationAdminEmail(details, creds);
    for (const call of state.calls) {
      expect(call.body.Messages[0].HTMLPart).not.toMatch(/display:\s*flex/);
    }
  });

  it("échappe le nom du client", async () => {
    await sendCancellationClientEmail({ ...details, client_nom: "<b>Bob</b>" }, creds);
    expect(lastMessage().HTMLPart).toContain("&lt;b&gt;Bob&lt;/b&gt;");
  });
});
