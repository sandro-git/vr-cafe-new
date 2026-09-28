import { chromium, type FullConfig } from "@playwright/test";
import { adminSessionCookie } from "./helpers/admin-session";

// Préchauffage : à chaque démarrage, Vite re-prépare ses dépendances puis recharge les pages
// ouvertes (« new dependencies optimized »), ce qui casse un test en cours (« Failed to fetch »,
// étapes du formulaire perdues). On parcourt les pages testées jusqu'à ce qu'un tour complet
// se fasse sans aucun rechargement de Vite.
const PAGES = ["/reservation", "/reservation/annulation", "/reservation-anniversaire", "/contact", "/admin/avis", "/cadeaux", "/cadeaux/merci", "/admin/bons"];
const MAX_ROUNDS = 5;

export default async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ baseURL });
  await context.addCookies([await adminSessionCookie(baseURL!)]);
  const page = await context.newPage();

  // Les données n'ont pas d'importance ici : réponses vides pour Supabase et /api/*.
  // (Un « Init error: Failed to fetch » dans le journal = rechargement de Vite absorbé ici.)
  await page.route(/supabase\.e2e\.test|\/api\//, (route) =>
    route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
      contentType: "application/json",
      body: "[]",
    }),
  );

  // « load » = chargement réel d'un document (le routeur d'Astro modifie aussi l'historique,
  // ce que « framenavigated » compterait à tort comme des navigations)
  let loads = 0;
  page.on("load", () => loads++);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    loads = 0;
    for (const path of PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.waitForTimeout(1_000);
    }
    if (loads === PAGES.length) break; // aucun rechargement de Vite en plus des goto
    if (round === MAX_ROUNDS) throw new Error("Préchauffage : Vite recharge encore les pages après 5 tours");
  }
  await browser.close();
}
