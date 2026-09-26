import { describe, expect, it } from "vitest";
import { hasMinNotice, MIN_NOTICE_MS } from "../netlify/lib/reservation-notice";

const NOW = Date.parse("2026-09-26T12:00:00+02:00");
const HOUR = 60 * 60 * 1000;

describe("hasMinNotice (règle des 24h)", () => {
  it("le préavis est de 24h", () => {
    expect(MIN_NOTICE_MS).toBe(24 * HOUR);
  });

  it("autorise un créneau dans plus de 24h", () => {
    expect(hasMinNotice(new Date(NOW + 72 * HOUR), NOW)).toBe(true);
  });

  it("autorise un créneau pile à 24h", () => {
    expect(hasMinNotice(new Date(NOW + 24 * HOUR), NOW)).toBe(true);
  });

  it("refuse un créneau à 24h moins une minute", () => {
    expect(hasMinNotice(new Date(NOW + 24 * HOUR - 60_000), NOW)).toBe(false);
  });

  it("refuse un créneau passé", () => {
    expect(hasMinNotice(new Date(NOW - HOUR), NOW)).toBe(false);
  });

  it("accepte une date ISO de Supabase (UTC)", () => {
    expect(hasMinNotice("2026-09-27T10:00:00+00:00", NOW)).toBe(true);  // 12:00 Paris le 27 = pile 24h
    expect(hasMinNotice("2026-09-27T09:59:00+00:00", NOW)).toBe(false);
  });
});
