import type { APIRoute } from "astro";
import { ADMIN_SESSION_COOKIE } from "../../../netlify/lib/admin-session";

// Déconnexion de CET appareil : efface le cookie de session. En POST uniquement
// (formulaire du header admin), pour qu'un simple lien externe ne puisse pas déconnecter.
// Le jeton étant sans état, déconnecter TOUS les appareils passe par la rotation de
// ADMIN_SESSION_SECRET (voir CLAUDE.md, « Session admin »).
export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(ADMIN_SESSION_COOKIE, { path: "/" });
  return redirect("/admin/login", 303);
};
