// API admin dédiée à la prospection — fichier séparé de admin-db.mts (même
// pattern d'auth / routage / réponse que admin-avis.mts) car ce domaine a sa
// propre intégration externe (Edge Function Supabase + API Brevo).
//
// La table `prospection` est verrouillée en RLS (deny by default, comme
// push_subscriptions) : toute lecture/écriture passe par cette fonction avec
// la service role key. L'envoi effectif des relances est délégué à la Edge
// Function Supabase `send-prospection` (voir supabase/functions/send-prospection)
// plutôt que dupliqué ici, pour garder la logique Brevo à un seul endroit ;
// cette fonction ne fait qu'authentifier l'appel depuis le back-office avant
// de le relayer avec la clé anon (JWT valide exigé par la Edge Function).

import type { Context, Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

function checkAuth(req: Request): boolean {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  const sessionValue = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;
  return !!adminPassword && sessionValue === adminPassword;
}

let _supabase: ReturnType<typeof createClient> | null = null;
// Cast en `any` : pas de type Database généré pour supabase-js dans ce projet
// (même limitation que admin-db.mts / admin-avis.mts).
function getSupabase() {
  return (_supabase ??= createClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )) as any;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!checkAuth(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { action } = body;

  switch (action) {
    // ── Liste des contacts ───────────────────────────────────────────────────
    case "list": {
      const { data, error } = await getSupabase()
        .from("prospection")
        .select("id, nom, email, telephone, statut, date_envoi, erreur, created_at")
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, contacts: data });
    }

    // ── Création d'un contact ────────────────────────────────────────────────
    case "create": {
      const { nom, email, telephone } = body as { nom?: string; email?: string; telephone?: string };
      if (!email?.trim()) return json({ error: "Missing email" }, 400);

      const { data, error } = await getSupabase()
        .from("prospection")
        .insert({
          nom: nom?.trim() || null,
          email: email.trim(),
          telephone: telephone?.trim() || null,
        })
        .select("id, nom, email, telephone, statut, date_envoi, erreur, created_at")
        .single();
      if (error) return json({ error: error.message, code: error.code }, 500);
      return json({ ok: true, contact: data });
    }

    // ── Suppression d'un contact ─────────────────────────────────────────────
    case "delete": {
      const { id } = body as { id: string };
      if (!id) return json({ error: "Missing id" }, 400);
      const { error } = await getSupabase().from("prospection").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── Envoi groupé des relances via la Edge Function Supabase ─────────────
    case "valider": {
      const { ids } = body as { ids?: unknown };
      const list = Array.isArray(ids) ? ids.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
      if (!list.length) return json({ error: "Missing or empty ids array" }, 400);

      const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
      const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) {
        return json({ error: "Configuration Supabase absente" }, 500);
      }

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-prospection`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ ids: list }),
        });
        const result = await response.json();
        if (!response.ok) return json({ error: result?.error ?? "Échec de l'appel à la Edge Function" }, 502);
        return json({ ok: true, ...result });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Erreur réseau vers la Edge Function" }, 502);
      }
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
};

export const config: Config = {
  path: "/api/admin/prospection",
};
