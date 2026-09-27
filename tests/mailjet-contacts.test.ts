import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, FakeMailjet } = await vi.hoisted(async () => {
  const { createMailjetMock } = await import("./helpers/mailjet-mock");
  return createMailjetMock();
});
vi.mock("node-mailjet", () => ({ default: FakeMailjet }));

// Supabase : seul le comptage des réservations confirmées est utilisé
const supa = vi.hoisted(() => ({ count: 0 as number | null, filters: [] as [string, unknown][] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    const q: any = {
      from: () => q,
      select: () => q,
      eq: (col: string, val: unknown) => { supa.filters.push([col, val]); return q; },
      then: (resolve: (v: unknown) => void) => resolve({ count: supa.count }),
    };
    return q;
  },
}));

import {
  createSegmentCampaign,
  deleteClientFromMailjet,
  syncClientToMailjet,
  updateClientInMailjet,
} from "../netlify/lib/mailjet-contacts";

const keys = { apiKey: "k", apiSecret: "s" };
const calls = (resource: string, method?: string) =>
  state.calls.filter((c) => c.resource === resource && (!method || c.method === method));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state.calls.length = 0;
  state.respond = () => ({ body: { Data: [] } });
  supa.count = 0;
  supa.filters.length = 0;
  vi.stubEnv("MAILJET_LIST_ID", "42");
  vi.stubEnv("PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", "anon");
  fetchMock = vi.fn(async () => new Response("", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("syncClientToMailjet", () => {
  const params = {
    nom: "Sandro Test",
    email: "test@vr-cafe.fr",
    telephone: "+33 6 71 41 06 95",
    vrType: "sans_fil",
    creneauDebut: "2026-10-03T12:00:00Z",
    ...keys,
  };

  it("sans email : aucun appel Mailjet", async () => {
    await syncClientToMailjet({ ...params, email: "" });
    expect(state.calls).toHaveLength(0);
  });

  it("crée le contact, met à jour ses propriétés et l'ajoute à la liste", async () => {
    supa.count = 4;
    await syncClientToMailjet(params);

    expect(calls("contact", "post")[0].body).toEqual({ Email: "test@vr-cafe.fr", Name: "Sandro Test", IsExcludedFromCampaigns: false });
    expect(calls("contactmetadata").map((c) => c.body.Name)).toEqual(["last_reservation_date", "reservation_count", "vr_type"]);

    const data = calls("contactdata", "put")[0];
    expect(data.id).toBe("test@vr-cafe.fr");
    expect(data.body.Data).toEqual([
      { Name: "last_reservation_date", Value: "2026-10-03T12:00:00Z" },
      { Name: "reservation_count", Value: 4 },
      { Name: "vr_type", Value: "VR Sans Fil" },
    ]);
    // Compte limité aux réservations confirmées du client
    expect(supa.filters).toEqual([["client_email", "test@vr-cafe.fr"], ["statut", "confirmée"]]);

    const list = calls("contactslist")[0];
    expect(list).toMatchObject({ id: 42, action: "managecontact" });
    expect(list.body).toEqual({
      Email: "test@vr-cafe.fr",
      Action: "addnoforce",
      Properties: { firstname: "Sandro", telephone: "+33 6 71 41 06 95" },
    });
  });

  it("propriétés déjà existantes (erreur Mailjet) : ignoré", async () => {
    state.respond = (c) => {
      if (c.resource === "contactmetadata") throw new Error("already exists");
      return { body: { Data: [] } };
    };
    await expect(syncClientToMailjet(params)).resolves.toBeUndefined();
    expect(calls("contactdata")).toHaveLength(1);
  });

  it("VR filaire, sans liste configurée, sans Supabase : compte à 0, pas d'ajout en liste", async () => {
    vi.stubEnv("MAILJET_LIST_ID", "");
    vi.stubEnv("PUBLIC_SUPABASE_URL", "");
    await syncClientToMailjet({ ...params, vrType: "filaire" });
    const values = calls("contactdata")[0].body.Data;
    expect(values).toContainEqual({ Name: "vr_type", Value: "VR Filaire" });
    expect(values).toContainEqual({ Name: "reservation_count", Value: 0 });
    expect(calls("contactslist")).toHaveLength(0);
  });
});

describe("deleteClientFromMailjet", () => {
  it("contact trouvé : suppression définitive v4 par ID", async () => {
    state.respond = (c) => (c.method === "get" ? { body: { Data: [{ ID: 987 }] } } : { body: {} });
    await deleteClientFromMailjet({ email: "a@b.fr", ...keys });
    expect(calls("contact", "get")[0].id).toBe("a@b.fr");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.mailjet.com/v4/contacts/987");
    expect(init).toMatchObject({ method: "DELETE", headers: { Authorization: `Basic ${Buffer.from("k:s").toString("base64")}` } });
  });

  it("contact absent (404) ou email vide : rien à supprimer", async () => {
    state.respond = () => { throw new Error("404"); };
    await deleteClientFromMailjet({ email: "a@b.fr", ...keys });
    await deleteClientFromMailjet({ email: "", ...keys });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("échec de suppression Mailjet : erreur remontée", async () => {
    state.respond = () => ({ body: { Data: [{ ID: 1 }] } });
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(deleteClientFromMailjet({ email: "a@b.fr", ...keys })).rejects.toThrow("Mailjet delete 1 a échoué : 500 nope");
  });
});

describe("updateClientInMailjet", () => {
  const base = { oldEmail: "a@b.fr", nom: "Alice Martin", email: "a@b.fr", telephone: "+33 6 71 41 06 95", ...keys };

  it("même email : met à jour le nom et la liste, ne supprime rien", async () => {
    await updateClientInMailjet(base);
    expect(calls("contact", "put")[0]).toMatchObject({ id: "a@b.fr", body: { Name: "Alice Martin" } });
    expect(calls("contactslist")[0].body.Properties).toEqual({ firstname: "Alice", telephone: "+33 6 71 41 06 95" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("changement de casse seulement : pas considéré comme un nouvel email", async () => {
    await updateClientInMailjet({ ...base, email: "A@B.FR" });
    expect(calls("contact", "get")).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("contact inexistant : création en repli", async () => {
    state.respond = (c) => {
      if (c.method === "put") throw new Error("404");
      return { body: { Data: [] } };
    };
    await updateClientInMailjet(base);
    expect(calls("contact", "post")[0].body).toEqual({ Email: "a@b.fr", Name: "Alice Martin", IsExcludedFromCampaigns: false });
  });

  it("email changé : nouveau contact puis suppression définitive de l'ancien", async () => {
    state.respond = (c) => (c.method === "get" ? { body: { Data: [{ ID: 555 }] } } : { body: { Data: [] } });
    await updateClientInMailjet({ ...base, email: "new@b.fr" });
    expect(calls("contact", "put")[0].id).toBe("new@b.fr");
    expect(calls("contact", "get")[0].id).toBe("a@b.fr");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mailjet.com/v4/contacts/555");
  });

  it("erreur sur la liste marketing : non bloquante", async () => {
    state.respond = (c) => {
      if (c.resource === "contactslist") throw new Error("bad property");
      return { body: { Data: [] } };
    };
    await expect(updateClientInMailjet(base)).resolves.toBeUndefined();
  });
});

describe("createSegmentCampaign", () => {
  const respondIds = (c: { resource: string; action?: string }) => {
    if (c.resource === "contactslist" && !c.action) return { body: { Data: [{ ID: 10 }] } };
    if (c.resource === "campaigndraft") return { body: { Data: [{ ID: 20 }] } };
    return { body: { Data: [] } };
  };

  it("crée la liste, ajoute les emails valides et le brouillon de campagne", async () => {
    state.respond = respondIds;
    const res = await createSegmentCampaign({
      segment: "inactifs",
      clients: [
        { nom: "Alice Martin", email: "a@b.fr" },
        { nom: "", email: "c@d.fr" },
        { nom: "Sans email", email: "" },
        { nom: "Invalide", email: "pas-un-email" },
      ],
      ...keys,
      senderEmail: "contact@vr-cafe.fr",
    });

    expect(res).toMatchObject({ listId: 10, contactsAdded: 2, contactsSkipped: 2, campaignDraftId: 20 });
    expect(res.listName).toMatch(/^Relance inactifs \d{2}\/\d{2}\/\d{4} \d+$/);

    const adds = state.calls.filter((c) => c.action === "managecontact");
    expect(adds.map((c) => [c.id, c.body.Email, c.body.Properties.firstname])).toEqual([
      [10, "a@b.fr", "Alice"],
      [10, "c@d.fr", ""],
    ]);
    expect(calls("campaigndraft")[0].body).toMatchObject({
      Subject: "On vous a manqué chez VR Café 👋",
      ContactsListID: 10,
      SenderEmail: "contact@vr-cafe.fr",
      Locale: "fr_FR",
    });
  });

  it("segment fidèles : sujet dédié", async () => {
    state.respond = respondIds;
    await createSegmentCampaign({ segment: "fideles", clients: [{ nom: "A", email: "a@b.fr" }], ...keys, senderEmail: "x@y.fr" });
    expect(calls("campaigndraft")[0].body.Subject).toBe("Merci pour votre fidélité 🎮");
  });

  it("un contact en échec n'interrompt pas le lot", async () => {
    state.respond = (c) => {
      if (c.action === "managecontact" && c.body.Email === "a@b.fr") throw new Error("x");
      return respondIds(c);
    };
    const res = await createSegmentCampaign({
      segment: "fideles",
      clients: [{ nom: "A", email: "a@b.fr" }, { nom: "C", email: "c@d.fr" }],
      ...keys,
      senderEmail: "x@y.fr",
    });
    expect(res.contactsAdded).toBe(1);
  });

  it("erreurs : liste non créée, aucun contact ajouté, brouillon non créé", async () => {
    const args = { segment: "fideles" as const, clients: [{ nom: "A", email: "a@b.fr" }], ...keys, senderEmail: "x@y.fr" };

    state.respond = () => ({ body: { Data: [] } });
    await expect(createSegmentCampaign(args)).rejects.toThrow("Échec de création de la liste Mailjet");

    state.respond = (c) => {
      if (c.action === "managecontact") throw new Error("x");
      return respondIds(c);
    };
    await expect(createSegmentCampaign(args)).rejects.toThrow("Aucun contact n'a pu être ajouté à la liste Mailjet");

    state.respond = (c) => (c.resource === "campaigndraft" ? { body: { Data: [] } } : respondIds(c));
    await expect(createSegmentCampaign(args)).rejects.toThrow("Échec de création du brouillon de campagne Mailjet");
  });
});
