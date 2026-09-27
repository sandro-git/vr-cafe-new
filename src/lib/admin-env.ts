import { getSecret } from "astro:env/server";
import type { AdminEnv } from "../../netlify/lib/admin-session";

/**
 * Variables de session admin côté Astro, lues à l'exécution (.env en dev, variables Netlify en prod).
 * Pas `import.meta.env` : Vite inlinerait les valeurs en clair dans le bundle serveur au build.
 */
export function astroAdminEnv(): AdminEnv {
  return { ADMIN_PASSWORD: getSecret("ADMIN_PASSWORD"), ADMIN_SESSION_SECRET: getSecret("ADMIN_SESSION_SECRET") };
}
