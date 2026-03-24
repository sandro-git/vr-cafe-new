import type { Context, Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Auth: check admin_session cookie
  const cookieHeader = req.headers.get("cookie") ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  const sessionValue = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;

  if (!adminPassword || sessionValue !== adminPassword) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { endpoint: string; keys: { p256dh: string; auth: string } };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return new Response(JSON.stringify({ error: "Missing fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from("push_subscriptions").upsert(
    { endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("push-subscribe upsert error:", error);
    return new Response(JSON.stringify({ error: "DB error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/push/subscribe",
};
