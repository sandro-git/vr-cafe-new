import { expect, test, type Page, type Request } from "@playwright/test";

// /api/contact-token et /api/contact (fonctions Netlify) simulés : aucun email envoyé.
async function setup(page: Page, { contactDelayMs = 0, contactStatus = 200 } = {}) {
  const posts: Request[] = [];
  await page.route("**/api/contact-token", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ csrf: "csrf-test", ts: String(Date.now()) }) }),
  );
  await page.route("**/api/contact", async (route) => {
    posts.push(route.request());
    if (contactDelayMs) await new Promise((r) => setTimeout(r, contactDelayMs));
    await route.fulfill({ status: contactStatus, contentType: "application/json", body: "{}" }).catch(() => {});
  });
  await page.goto("/contact");
  const form = page.locator('form[name="contact"]');
  await expect(form.locator('input[name="_csrf"]')).toHaveValue("csrf-test");
  await form.locator('input[type="text"]').first().fill("Sandro TEST");
  await form.locator('input[name="email"]').fill("test@vr-cafe.fr");
  await form.locator('[name="subject"]').fill("Question");
  await form.locator('textarea[name="message"]').fill("Bonjour, ceci est un test.");
  return { form, posts };
}

test("envoi : bouton désactivé pendant l'envoi, un double clic n'envoie qu'un message", async ({ page }) => {
  const { form, posts } = await setup(page, { contactDelayMs: 1_500 });
  const btn = form.locator("#contact-submit");
  await expect(btn).toBeEnabled();

  await btn.click();
  await expect(btn).toBeDisabled();
  await btn.click({ force: true }); // second clic pendant l'envoi
  await page.waitForURL(/\/contact\/merci$/);

  expect(posts).toHaveLength(1);
  const body = posts[0].postData() ?? "";
  expect(body).toContain("csrf-test");
  expect(body).toContain("Bonjour, ceci est un test.");
});

test("échec d'envoi : message d'erreur, bouton réactivé", async ({ page }) => {
  const { form } = await setup(page, { contactStatus: 500 });
  const btn = form.locator("#contact-submit");
  await btn.click();
  await expect(form.locator("#contact-error")).toBeVisible();
  await expect(btn).toBeEnabled();
});
