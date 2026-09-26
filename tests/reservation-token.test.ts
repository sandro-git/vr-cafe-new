import { beforeAll, describe, expect, it } from "vitest";
import { generateReservationToken, verifyReservationToken } from "../netlify/lib/reservation-token";

const ID = "305b8767-1234-4abc-9def-0123456789ab";
const OTHER_ID = "11111111-2222-4333-8444-555555555555";

beforeAll(() => {
  process.env.ADMIN_PASSWORD = "secret-de-test";
});

describe("reservation-token", () => {
  it("génère un token stable pour un même id", async () => {
    const a = await generateReservationToken(ID);
    const b = await generateReservationToken(ID);
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("accepte le token de la réservation", async () => {
    const token = await generateReservationToken(ID);
    expect(await verifyReservationToken(ID, token)).toBe(true);
  });

  it("refuse le token d'une autre réservation", async () => {
    const token = await generateReservationToken(OTHER_ID);
    expect(await verifyReservationToken(ID, token)).toBe(false);
  });

  it("refuse un token modifié d'un caractère", async () => {
    const token = await generateReservationToken(ID);
    const tampered = (token[0] === "A" ? "B" : "A") + token.slice(1);
    expect(await verifyReservationToken(ID, tampered)).toBe(false);
  });

  it("refuse un token vide ou de mauvaise longueur", async () => {
    const token = await generateReservationToken(ID);
    expect(await verifyReservationToken(ID, "")).toBe(false);
    expect(await verifyReservationToken(ID, token.slice(0, -1))).toBe(false);
  });

  it("un changement de secret invalide les anciens tokens", async () => {
    const token = await generateReservationToken(ID);
    process.env.ADMIN_PASSWORD = "autre-secret";
    try {
      expect(await verifyReservationToken(ID, token)).toBe(false);
    } finally {
      process.env.ADMIN_PASSWORD = "secret-de-test";
    }
  });
});
