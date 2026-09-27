import { defineConfig, devices } from "@playwright/test";

// Tests de bout en bout sur un `astro dev` dédié (port 4399), lancé avec :
// - un mot de passe admin de test (jamais le vrai) ;
// - une URL Supabase bidon : tout appel non simulé échoue au lieu de toucher la base de prod.
// Supabase et les fonctions Netlify (/api/*) sont simulés dans le navigateur (e2e/helpers/mocks.ts) :
// aucune réservation, aucun email, aucune réponse Google n'est réellement créé.
const PORT = 4399;
export const E2E_ADMIN_PASSWORD = "e2e-admin-password";
export const E2E_SUPABASE_URL = "http://supabase.e2e.test";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [
    // Chrome installé sur la machine : pas de navigateur à télécharger
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],
  webServer: {
    command: `bun run astro dev --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Astro 7 passe `astro dev` en arrière-plan quand il détecte un agent IA (Claude Code…),
      // ce que Playwright prend pour un plantage : cette variable (utilisée par Astro pour ses
      // propres serveurs d'arrière-plan) le garde au premier plan.
      ASTRO_DEV_BACKGROUND: "1",
      ADMIN_PASSWORD: E2E_ADMIN_PASSWORD,
      PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
      PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
