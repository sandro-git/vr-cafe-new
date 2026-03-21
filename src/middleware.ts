import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const cookie = context.cookies.get("admin_session");
    const password = import.meta.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

    if (!password || cookie?.value !== password) {
      return context.redirect("/admin/login");
    }
  }

  return next();
});
