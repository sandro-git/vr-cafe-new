import { describe, expect, it } from "vitest";
import { newReservationId } from "../src/lib/uuid";

describe("newReservationId", () => {
  it("génère des UUID v4 valides et distincts", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newReservationId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
