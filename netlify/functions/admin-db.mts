import type { Context, Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

function checkAuth(req: Request): boolean {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  const sessionValue = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;
  return !!adminPassword && sessionValue === adminPassword;
}

function makeSupabase() {
  return createClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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

  const supabase = makeSupabase();
  const { action } = body;

  switch (action) {
    // ── Réservations ────────────────────────────────────────────────────────
    case "update_reservation": {
      const { id, fields } = body as { id: string; fields: Record<string, unknown> };
      if (!id || !fields) return json({ error: "Missing id or fields" }, 400);
      const { error } = await supabase.from("reservations").update(fields).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── Périodes de vacances ─────────────────────────────────────────────────
    case "insert_vacances": {
      const { date_debut, date_fin, label } = body as {
        date_debut: string; date_fin: string; label?: string;
      };
      if (!date_debut || !date_fin) return json({ error: "Missing dates" }, 400);
      const { error } = await supabase
        .from("periodes_vacances")
        .insert({ date_debut, date_fin, label: label || null });
      if (error) return json({ error: error.message, code: error.code }, 500);
      return json({ ok: true });
    }

    case "delete_vacances": {
      const { id } = body as { id: string };
      if (!id) return json({ error: "Missing id" }, 400);
      const { error } = await supabase.from("periodes_vacances").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── Jours de fermeture ───────────────────────────────────────────────────
    case "insert_fermeture": {
      const { date, motif } = body as { date: string; motif?: string };
      if (!date) return json({ error: "Missing date" }, 400);
      const { error } = await supabase
        .from("jours_fermeture")
        .insert({ date, motif: motif || null });
      if (error) return json({ error: error.message, code: error.code }, 500);
      return json({ ok: true });
    }

    case "delete_fermeture": {
      const { id } = body as { id: string };
      if (!id) return json({ error: "Missing id" }, 400);
      const { error } = await supabase.from("jours_fermeture").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── Réassignation de box ─────────────────────────────────────────────────
    case "reassign_reservation_box": {
      const { reservation_id, box_ids } = body as { reservation_id: string; box_ids: string[] };
      if (!reservation_id || !Array.isArray(box_ids) || !box_ids.length)
        return json({ error: "Missing params" }, 400);
      const { error: delErr } = await supabase
        .from("reservation_boxes")
        .delete()
        .eq("reservation_id", reservation_id);
      if (delErr) return json({ error: delErr.message }, 500);
      const { error: insErr } = await supabase
        .from("reservation_boxes")
        .insert(box_ids.map(box_id => ({ reservation_id, box_id })));
      if (insErr) return json({ error: insErr.message }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
};

export const config: Config = {
  path: "/api/admin/db",
};
