import { expect, type Page } from "@playwright/test";

/** Étapes 1 et 2 : samedi 3 octobre, 3 joueurs, VR filaire, 1 h, créneau de 15:00. */
export async function chooseSlot(page: Page, { slot = "15:00", joueurs = "3" } = {}) {
  await page.locator("#dp-trigger").click();
  await expect(page.locator("#dp-title")).toHaveText("octobre 2026");
  await page.locator("#dp-grid button:not([disabled])", { hasText: /^3$/ }).click();
  await page.locator("#nb-personnes-grid").getByRole("button", { name: joueurs, exact: true }).click();
  await page.locator("#vr-type-grid").getByRole("button", { name: /VR Filaire/ }).click();
  await page.locator("#durees-list").getByRole("button", { name: "1 h" }).click();
  await page.locator("#btn-search").click();
  await expect(page.locator("#step-2")).toBeVisible();
  await page.locator("#slots-grid").getByRole("button", { name: new RegExp(`^${slot}`) }).click();
  await expect(page.locator("#step-3")).toBeVisible();
}
