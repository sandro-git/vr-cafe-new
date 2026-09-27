import type { Context, Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "../lib/admin-session.ts";

// POST   : enregistre (upsert) l'abonnement push de l'appareil admin
// DELETE : le supprime (bouton « Déconnexion » du header admin, avant l'effacement du cookie)

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Auth: check admin_session cookie
  if (!(await isAdminRequest(req))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { endpoint, keys } = body;
  if (!endpoint || (req.method === "POST" && (!keys?.p256dh || !keys?.auth))) {
    return json({ error: "Missing fields" }, 400);
  }

  const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (req.method === "DELETE") {
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) {
      console.error("push-subscribe delete error:", error);
      return json({ error: "DB error" }, 500);
    }
    return json({ ok: true });
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    { endpoint, p256dh: keys!.p256dh, auth: keys!.auth },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("push-subscribe upsert error:", error);
    return json({ error: "DB error" }, 500);
  }

  return json({ ok: true });
};

export const config: Config = {
  path: "/api/push/subscribe",
};
