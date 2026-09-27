import { defineMiddleware } from "astro:middleware";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "../netlify/lib/admin-session";
import { astroAdminEnv } from "./lib/admin-env";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const cookie = context.cookies.get(ADMIN_SESSION_COOKIE);
    if (!(await verifyAdminSession(cookie?.value, astroAdminEnv()))) {
      return context.redirect("/admin/login");
    }
  }

  return next();
});
