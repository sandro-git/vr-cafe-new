import { expect, test, type Page, type Request } from "@playwright/test";
import { adminSessionCookie } from "./helpers/admin-session";
import { FakeSupabase } from "./helpers/mocks";

// Le Chrome de test n'a pas de vrai service push : on simule dans la page
// navigator.serviceWorker et l'abonnement de l'appareil.
type PushMode = "subscribed" | "none" | "unsubscribe-fails" | "sw-error";
const ENDPOINT = "https://push.example.test/abonnement-123";

async function fakePush(page: Page, mode: PushMode, events: string[] = []) {
  await page.exposeFunction("__pushEvent", (e: string) => events.push(e));
  await page.addInitScript(
    ({ mode, endpoint }) => {
      const sub = {
        endpoint,
        unsubscribe: async () => {
          await (window as any).__pushEvent("unsubscribe");
          return mode !== "unsubscribe-fails";
        },
      };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          register: () => new Promise(() => {}), // l'enregistrement au chargement n'intervient pas ici
          getRegistration: async () => {
            if (mode === "sw-error") throw new Error("service worker indisponible");
            return { pushManager: { getSubscription: async () => (mode === "none" ? null : sub) } };
          },
        },
      });
    },
    { mode, endpoint: ENDPOINT },
  );
}

async function openAdmin(page: Page, baseURL: string) {
  await page.context().addCookies([await adminSessionCookie(baseURL)]);
  await new FakeSupabase().install(page);
  await page.goto("/admin/avis");
}

function capturePushApi(page: Page, { delayMs = 0, events = [] as string[] } = {}) {
  const calls: Request[] = [];
  return page
    .route("**/api/push/subscribe", async (route) => {
      calls.push(route.request());
      events.push(route.request().method());
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }).catch(() => {});
    })
    .then(() => calls);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 5_000 });
  expect((await page.context().cookies()).some((c) => c.name === "admin_session")).toBe(false);
}

test("abonné : désabonnement du navigateur puis suppression côté serveur, avant d'effacer la session", async ({ page, baseURL }) => {
  const events: string[] = [];
  await fakePush(page, "subscribed", events);
  const calls = await capturePushApi(page, { events });
  page.on("request", (r) => { if (r.url().endsWith("/admin/logout")) events.push("logout"); });
  await openAdmin(page, baseURL!);

  await logout(page);

  expect(events).toEqual(["unsubscribe", "DELETE", "logout"]);
  expect(calls).toHaveLength(1);
  expect(calls[0].method()).toBe("DELETE");
  expect(calls[0].postDataJSON()).toEqual({ endpoint: ENDPOINT });
  expect(calls[0].headers()["cookie"] ?? (await calls[0].allHeaders())["cookie"]).toContain("admin_session=");
});

test("pas d'abonnement sur l'appareil : déconnexion sans appel serveur", async ({ page, baseURL }) => {
  await fakePush(page, "none");
  const calls = await capturePushApi(page);
  await openAdmin(page, baseURL!);
  await logout(page);
  expect(calls).toEqual([]);
});

test("le navigateur refuse le désabonnement : la ligne serveur est gardée, déconnexion quand même", async ({ page, baseURL }) => {
  const events: string[] = [];
  await fakePush(page, "unsubscribe-fails", events);
  const calls = await capturePushApi(page);
  await openAdmin(page, baseURL!);
  await logout(page);
  expect(events).toEqual(["unsubscribe"]);
  expect(calls).toEqual([]);
});

test("service worker en erreur : déconnexion quand même", async ({ page, baseURL }) => {
  await fakePush(page, "sw-error");
  await openAdmin(page, baseURL!);
  await logout(page);
});

test("serveur qui ne répond pas : déconnexion au bout de 2 s maximum", async ({ page, baseURL }) => {
  await fakePush(page, "subscribed");
  const calls = await capturePushApi(page, { delayMs: 15_000 });
  await openAdmin(page, baseURL!);
  const start = Date.now();
  await logout(page);
  expect(Date.now() - start).toBeLessThan(4_500);
  expect(calls).toHaveLength(1);
});
