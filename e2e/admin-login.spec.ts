import { expect, test } from "@playwright/test";
import { E2E_ADMIN_PASSWORD } from "../playwright.config";

test("connexion : le cookie de session ne contient pas le mot de passe", async ({ page, context }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Mot de passe").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/admin\/reservations$/);

  const session = (await context.cookies()).find((c) => c.name === "admin_session");
  expect(session?.value).toMatch(/^v1\.\d+\.\d+\.[A-Za-z0-9_-]+$/);
  expect(session?.value).not.toContain(E2E_ADMIN_PASSWORD);
  expect(session?.httpOnly).toBe(true);
});

test("connexion : mauvais mot de passe refusé", async ({ page, context }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Mot de passe").fill("mauvais");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Mot de passe incorrect.")).toBeVisible();
  expect((await context.cookies()).some((c) => c.name === "admin_session")).toBe(false);
});

test("ancien cookie (mot de passe en clair) refusé", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "admin_session", value: E2E_ADMIN_PASSWORD, url: baseURL! }]);
  await page.goto("/admin/avis");
  await expect(page).toHaveURL(/\/admin\/login$/);
});
