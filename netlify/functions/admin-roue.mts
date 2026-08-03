// API admin dédiée à la validation des codes de la roue de récompense —
// fichier séparé de admin-db.mts pour rester cohérent avec le pattern déjà
// suivi par admin-avis.mts (un domaine métier = un fichier). Même pattern
// d'auth / routage / réponse que les autres API admin.

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
function getSupabase() {
  return (_supabase ??= createClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
    // ── Rechercher un tirage par son code (sans le marquer utilisé) ─────────
    case "rechercher_code": {
      const { code } = body as { code: string };
      if (!code?.trim()) return json({ error: "Missing code" }, 400);

      const { data, error } = await getSupabase()
        .from("roue_tirages")
        .select("email, lot_label, utilise, utilise_at, created_at")
        .eq("code", code.trim().toUpperCase())
        .maybeSingle();

      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "Code introuvable" }, 404);

      return json({ ok: true, tirage: data });
    }

    // ── Marquer un code comme utilisé (validation en caisse) ────────────────
    case "valider_code": {
      const { code } = body as { code: string };
      if (!code?.trim()) return json({ error: "Missing code" }, 400);

      const codeNormalise = code.trim().toUpperCase();

      const { data: tirage, error: selErr } = await getSupabase()
        .from("roue_tirages")
        .select("id, lot_label, utilise, utilise_at")
        .eq("code", codeNormalise)
        .maybeSingle();

      if (selErr) return json({ error: selErr.message }, 500);
      if (!tirage) return json({ error: "Code introuvable" }, 404);
      if (tirage.utilise) {
        return json(
          { error: `Déjà utilisé le ${new Date(tirage.utilise_at as string).toLocaleString("fr-FR")}` },
          409
        );
      }

      const { error: updErr } = await getSupabase()
        .from("roue_tirages")
        .update({ utilise: true, utilise_at: new Date().toISOString() })
        .eq("id", tirage.id);

      if (updErr) return json({ error: updErr.message }, 500);

      return json({ ok: true, lot_label: tirage.lot_label });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
};

export const config: Config = {
  path: "/api/admin/roue",
};
