import { describe, expect, it } from "vitest";
import { calcMontant, calcMontantReservation, PRIX_ANNIVERSAIRE_DEFAUT } from "../src/lib/pricing";

describe("calcMontant (grille standard/MDJ)", () => {
  it("30 min : 18 € par joueur, quel que soit le groupe", () => {
    expect(calcMontant(30, 1)).toBe(18);
    expect(calcMontant(30, 4)).toBe(72);
    expect(calcMontant(30, 8)).toBe(144);
  });

  it("60 min : 29 € jusqu'à 2 joueurs", () => {
    expect(calcMontant(60, 1)).toBe(29);
    expect(calcMontant(60, 2)).toBe(58);
  });

  it("60 min : 27 € de 3 à 4 joueurs", () => {
    expect(calcMontant(60, 3)).toBe(81);
    expect(calcMontant(60, 4)).toBe(108);
  });

  it("60 min : 25 € à partir de 5 joueurs", () => {
    expect(calcMontant(60, 5)).toBe(125);
    expect(calcMontant(60, 8)).toBe(200);
  });

  it("durée hors grille : null", () => {
    expect(calcMontant(45, 2)).toBeNull();
    expect(calcMontant(90, 2)).toBeNull();
  });
});

describe("calcMontantReservation", () => {
  it("anniversaire : prix Sanity × joueurs, indépendamment de la durée", () => {
    expect(calcMontantReservation("anniversaire", 60, 6, 25)).toBe(150);
    expect(calcMontantReservation("anniversaire", 120, 10, 30)).toBe(300);
  });

  it("anniversaire sans prix fourni : 25 € par défaut", () => {
    expect(PRIX_ANNIVERSAIRE_DEFAUT).toBe(25);
    expect(calcMontantReservation("anniversaire", 60, 4)).toBe(100);
  });

  it("standard et MDJ : grille calcMontant", () => {
    expect(calcMontantReservation("standard", 60, 3)).toBe(81);
    expect(calcMontantReservation("mdj", 30, 2)).toBe(36);
  });

  it("type absent (anciennes réservations) : grille calcMontant", () => {
    expect(calcMontantReservation(null, 60, 5)).toBe(125);
    expect(calcMontantReservation(undefined, 30, 1)).toBe(18);
  });

  it("le prix anniversaire n'affecte pas les autres types", () => {
    expect(calcMontantReservation("standard", 60, 2, 99)).toBe(58);
  });
});
