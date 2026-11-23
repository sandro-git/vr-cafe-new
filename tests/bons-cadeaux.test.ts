import { describe, expect, it } from "vitest";
import {
  BON_CODE_ALPHABET,
  OFFRES_BON,
  PROMOS_BON,
  bonEtat,
  bonExpiry,
  formatEuros,
  generateBonCode,
  getOffreBon,
  isBonCode,
  libellePrixBon,
  normalizeBonCode,
  prixBon,
  prixPayeBon,
  promoActive,
  resteAPayer,
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

describe("resteAPayer", () => {
  it("déduit la valeur des bons du prix de la session", () => {
    expect(resteAPayer(108, [{ montant: 58 }])).toEqual({ deduction: 58, reste: 50 });
    expect(resteAPayer(116, [{ montant: 58 }, { montant: 58 }])).toEqual({ deduction: 116, reste: 0 });
  });

  it("un bon qui vaut plus que la session ne rend pas la monnaie", () => {
    expect(resteAPayer(18, [{ montant: 58 }])).toEqual({ deduction: 18, reste: 0 });
  });

  it("prix inconnu : pas de reste calculé", () => {
    expect(resteAPayer(null, [{ montant: 29 }])).toEqual({ deduction: 29, reste: null });
  });

  it("bon acheté en promo (14,40 €) : déduit sa valeur, la session 30 min solo est entièrement couverte", () => {
    const bon = { offre: "30_solo", montant: 18, created_at: "2026-11-28T12:00:00Z" };
    expect(prixPayeBon(bon)).toBe(14.4);
    expect(resteAPayer(18, [bon])).toEqual({ deduction: 18, reste: 0 });
  });
});

describe("promo Black Friday 2026 (-20 %)", () => {
  const prix = (date: string) => OFFRES_BON.map((o) => prixBon(o, date));
  const NORMAL = [18, 36, 29, 58];
  const PROMO = [14.4, 28.8, 23.2, 46.4];

  it("liste datée : 27/11 00:00 → 01/12 00:00 heure de Paris (fin exclue)", () => {
    expect(PROMOS_BON.find((p) => p.id === "black-friday-2026")).toMatchObject({ label: "Black Friday", remisePct: 20 });
  });

  it("veille (26/11 23:59:59 Paris) : prix normal", () => {
    expect(promoActive("2026-11-26T22:59:59Z")).toBeNull();
    expect(prix("2026-11-26T22:59:59Z")).toEqual(NORMAL);
  });

  it("début (27/11 00:00 Paris) : -20 %, valeurs exactes au centime", () => {
    expect(promoActive("2026-11-26T23:00:00Z")?.id).toBe("black-friday-2026");
    expect(prix("2026-11-26T23:00:00Z")).toEqual(PROMO);
  });

  it("pendant et dernière seconde (30/11 23:59:59 Paris) : -20 %", () => {
    expect(prix("2026-11-28T15:30:00Z")).toEqual(PROMO);
    expect(prix("2026-11-30T22:59:59Z")).toEqual(PROMO);
    expect(prixBon(getOffreBon("60_solo")!, new Date("2026-11-30T22:59:59Z"))).toBe(23.2); // pas 23.200000000000003
    expect(prixBon(getOffreBon("60_solo")!, Date.parse("2026-11-30T22:59:59Z"))).toBe(23.2);
  });

  it("après (01/12 00:00 Paris) : prix normal", () => {
    expect(promoActive("2026-11-30T23:00:00Z")).toBeNull();
    expect(prix("2026-11-30T23:00:00Z")).toEqual(NORMAL);
  });

  it("prixPayeBon : valeur du bon avec la promo en cours à sa création", () => {
    expect(prixPayeBon({ offre: "60_duo", montant: 58, created_at: "2026-11-29T10:00:00Z" })).toBe(46.4);
    expect(prixPayeBon({ offre: "60_duo", montant: 58, created_at: "2026-10-01T10:00:00Z" })).toBe(58);
    // offre retirée depuis : la promo s'appliquait quand même à l'achat
    expect(prixPayeBon({ offre: "ancienne_offre", montant: 40, created_at: "2026-11-29T10:00:00Z" })).toBe(32);
    expect(prixPayeBon({ offre: "60_duo", montant: 58, created_at: "pas une date" })).toBe(58);
  });

  it("prixPayeBon ne dépend pas du tarif actuel de l'offre (changement de prix ultérieur)", () => {
    // bon 30 min solo vendu 18 € ; le tarif actuel de l'offre (18 €) ne doit pas compter
    const offre = getOffreBon("30_solo")!;
    const avant = offre.prix;
    try {
      (offre as { prix: number }).prix = 20; // simule une hausse de tarif après la vente
      expect(prixPayeBon({ offre: "30_solo", montant: 18, created_at: "2026-10-01T10:00:00Z" })).toBe(18);
      expect(prixPayeBon({ offre: "30_solo", montant: 18, created_at: "2026-11-28T10:00:00Z" })).toBe(14.4);
      expect(libellePrixBon({ offre: "30_solo", montant: 18, created_at: "2026-10-01T10:00:00Z" })).toBe("18 €");
    } finally {
      (offre as { prix: number }).prix = avant;
    }
  });

  it("formatEuros et libellé admin", () => {
    expect(formatEuros(18)).toBe("18 €");
    expect(formatEuros(14.4)).toBe("14,40 €");
    expect(libellePrixBon({ offre: "30_solo", montant: 18, created_at: "2026-11-28T12:00:00Z" })).toBe("14,40 € (Black Friday, valeur 18 €)");
    expect(libellePrixBon({ offre: "30_solo", montant: 18, created_at: "2026-10-01T12:00:00Z" })).toBe("18 €");
  });
});
