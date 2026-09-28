import { describe, expect, it } from "vitest";
import {
  BON_CODE_ALPHABET,
  OFFRES_BON,
  bonEtat,
  bonExpiry,
  generateBonCode,
  getOffreBon,
  isBonCode,
  normalizeBonCode,
  validateBonAchat,
} from "../src/lib/bons-cadeaux";

describe("offres de bons cadeaux", () => {
  it("prix de la grille des réservations : 30 min 18 €/36 €, 1h 29 €/58 €", () => {
    expect(OFFRES_BON.map((o) => [o.id, o.prix])).toEqual([
      ["30_solo", 18],
      ["30_duo", 36],
      ["60_solo", 29],
      ["60_duo", 58],
    ]);
  });

  it("getOffreBon : offre inconnue ou non textuelle → null", () => {
    expect(getOffreBon("60_duo")?.label).toBe("1h duo");
    expect(getOffreBon("60_trio")).toBeNull();
    expect(getOffreBon(undefined)).toBeNull();
    expect(getOffreBon({ id: "60_duo" })).toBeNull();
  });
});

describe("codes des bons", () => {
  it("format VRC-XXXX-XXXX, sans 0/O/1/I", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateBonCode();
      expect(isBonCode(code)).toBe(true);
      expect(code).not.toMatch(/[01IO]/);
    }
    expect(BON_CODE_ALPHABET).toHaveLength(32);
  });

  it("chaque octet choisit un caractère par ses 5 bits de poids faible", () => {
    expect(generateBonCode(() => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]))).toBe("VRC-2345-6789");
    expect(generateBonCode(() => Uint8Array.from([224, 225, 226, 227, 228, 229, 230, 231]))).toBe("VRC-2345-6789");
    expect(generateBonCode(() => new Uint8Array(8).fill(255))).toBe("VRC-ZZZZ-ZZZZ");
  });

  it("normalizeBonCode remet en forme un code saisi à la main", () => {
    expect(normalizeBonCode("vrc 7k2m 9qxa")).toBe("VRC-7K2M-9QXA");
    expect(normalizeBonCode("7K2M9QXA")).toBe("VRC-7K2M-9QXA");
    expect(normalizeBonCode(" VRC-7K2M-9QXA ")).toBe("VRC-7K2M-9QXA");
    expect(normalizeBonCode("dupont")).toBe("DUPONT");
  });
});

describe("validité", () => {
  it("expire 12 mois après le paiement", () => {
    expect(bonExpiry(new Date("2026-09-28T18:30:00Z")).toISOString()).toBe("2027-09-28T18:30:00.000Z");
  });

  it("un bon valide dont la date est passée est « expire »", () => {
    const now = Date.parse("2027-10-01T00:00:00Z");
    expect(bonEtat({ statut: "valide", expire_le: "2027-09-28T18:30:00Z" }, now)).toBe("expire");
    expect(bonEtat({ statut: "valide", expire_le: "2027-10-02T00:00:00Z" }, now)).toBe("valide");
    expect(bonEtat({ statut: "utilise", expire_le: "2027-09-28T18:30:00Z" }, now)).toBe("utilise");
    expect(bonEtat({ statut: "en_attente", expire_le: null }, now)).toBe("en_attente");
  });
});

describe("validateBonAchat", () => {
  const ok = { offre: "30_duo", acheteur_nom: " Marie ", acheteur_email: " Marie@Gmail.com ", beneficiaire_nom: "Léa", message: "" };

  it("nettoie la saisie et joint l'offre", () => {
    const r = validateBonAchat(ok);
    expect(r).toEqual({
      ok: true,
      value: { offre: getOffreBon("30_duo"), acheteur_nom: "Marie", acheteur_email: "marie@gmail.com", beneficiaire_nom: "Léa", message: null },
    });
  });

  it("ignore un prix envoyé par le navigateur", () => {
    const r = validateBonAchat({ ...ok, prix: 1, montant: 1 });
    expect(r.ok && r.value.offre.prix).toBe(36);
  });

  it("refuse offre inconnue, noms vides, email invalide ou bidon, textes trop longs", () => {
    const r = validateBonAchat({ offre: "x", acheteur_nom: "", acheteur_email: "a@example.com", beneficiaire_nom: "x".repeat(81), message: "m".repeat(301) });
    expect(r.ok).toBe(false);
    expect(Object.keys(!r.ok ? r.errors : {}).sort()).toEqual(["acheteur_email", "acheteur_nom", "beneficiaire_nom", "message", "offre"]);
    expect(validateBonAchat({ ...ok, acheteur_email: "pas-un-email" }).ok).toBe(false);
  });
});
