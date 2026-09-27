import { createAdminSession } from "../../netlify/lib/admin-session";
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_SESSION_SECRET } from "../../playwright.config";

/** Cookie `admin_session` valide pour le serveur de test (signé avec les secrets de playwright.config.ts). */
export async function adminSessionCookie(url: string) {
  const value = await createAdminSession({
    ADMIN_PASSWORD: E2E_ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: E2E_ADMIN_SESSION_SECRET,
  });
  return { name: "admin_session", value: value!, url };
}
