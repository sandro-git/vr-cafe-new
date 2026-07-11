import type { Context, Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { updateClientInMailjet, deleteClientFromMailjet, createSegmentCampaign } from "../lib/mailjet-contacts.ts";

function mailjetCreds(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_API_SECRET;
  return apiKey && apiSecret ? { apiKey, apiSecret } : null;
}

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

// Instancié à la demande : certaines actions (ex. create_campaign) ne touchent pas Supabase
// et ne doivent pas échouer si SUPABASE_SERVICE_ROLE_KEY est absente.
let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  return (_supabase ??= makeSupabase());
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
    // ── Réservations ────────────────────────────────────────────────────────
    case "update_reservation": {
      const { id, fields } = body as { id: string; fields: Record<string, unknown> };
      if (!id || !fields) return json({ error: "Missing id or fields" }, 400);
      const { error } = await getSupabase().from("reservations").update(fields).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── Clients ──────────────────────────────────────────────────────────────
    case "update_client": {
      const { id, fields } = body as {
        id: string;
        fields: { nom?: string; email?: string; telephone?: string };
      };
      if (!id || !fields || typeof fields !== "object" || !Object.keys(fields).length)
        return json({ error: "Missing id or fields" }, 400);

      // 0. Récupérer la fiche actuelle (pour l'ancien email — clé Mailjet)
      const { data: before, error: beforeErr } = await getSupabase()
        .from("clients")
        .select("nom, email, telephone")
        .eq("id", id)
        .single();
      if (beforeErr) return json({ error: beforeErr.message }, 500);

      // 1. Mettre à jour la fiche client
      const { error: cErr } = await getSupabase()
        .from("clients")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (cErr) return json({ error: cErr.message }, 500);

      // 2. Propager aux champs dénormalisés des réservations du client
      const resaFields: Record<string, unknown> = {};
      if (fields.nom !== undefined) resaFields.client_nom = fields.nom;
      if (fields.email !== undefined) resaFields.client_email = fields.email;
      if (fields.telephone !== undefined) resaFields.client_telephone = fields.telephone;
      if (Object.keys(resaFields).length) {
        const { error: rErr } = await getSupabase()
          .from("reservations")
          .update(resaFields)
          .eq("client_id", id);
        if (rErr) return json({ error: rErr.message }, 500);
      }

      // 3. Synchroniser Mailjet (non bloquant — Supabase est la source de vérité)
      let mailjet_warning: string | undefined;
      const creds = mailjetCreds();
      if (creds) {
        try {
          await updateClientInMailjet({
            oldEmail: before?.email ?? "",
            nom: fields.nom ?? before?.nom ?? "",
            email: fields.email ?? before?.email ?? "",
            telephone: fields.telephone ?? before?.telephone ?? "",
            ...creds,
          });
        } catch (e) {
          mailjet_warning = e instanceof Error ? e.message : String(e);
        }
      }
      return json({ ok: true, mailjet_warning });
    }

    case "delete_client": {
      const { id } = body as { id: string };
      if (!id) return json({ error: "Missing id" }, 400);

      // 0. Récupérer l'email du client (clé Mailjet) avant suppression
      const { data: before } = await getSupabase()
        .from("clients")
        .select("email")
        .eq("id", id)
        .single();

      // 1. Récupérer les réservations du client
      const { data: resas, error: selErr } = await getSupabase()
        .from("reservations")
        .select("id")
        .eq("client_id", id);
      if (selErr) return json({ error: selErr.message }, 500);

      const ids = (resas ?? []).map((r) => r.id);

      // 2. Supprimer explicitement les box associées (ne pas dépendre de la cascade)
      if (ids.length) {
        const { error: boxErr } = await getSupabase()
          .from("reservation_boxes")
          .delete()
          .in("reservation_id", ids);
        if (boxErr) return json({ error: boxErr.message }, 500);
      }

      // 3. Supprimer le client (cascade vers ses réservations via client_id)
      const { error } = await getSupabase().from("clients").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);

      // 4. Suppression définitive (RGPD) du contact Mailjet (non bloquant)
      let mailjet_warning: string | undefined;
      const creds = mailjetCreds();
      if (creds && before?.email) {
        try {
          await deleteClientFromMailjet({ email: before.email, ...creds });
        } catch (e) {
          mailjet_warning = e instanceof Error ? e.message : String(e);
        }
      }
      return json({ ok: true, deleted: ids.length, mailjet_warning });
    }

    // ── Périodes de vacances ─────────────────────────────────────────────────
    case "insert_vacances": {
      const { date_debut, date_fin, label } = body as {
        date_debut: string; date_fin: string; label?: string;
      };
      if (!date_debut || !date_fin) return json({ error: "Missing dates" }, 400);
      const { error } = await getSupabase()
        .from("periodes_vacances")
        .insert({ date_debut, date_fin, label: label || null });
      if (error) return json({ error: error.message, code: error.code }, 500);
      return json({ ok: true });
    }

    case "delete_vacances": {
      const { id } = body as { id: string };
      if (!id) return json({ error: "Missing id" }, 400);
      const { error } = await getSupabase().from("periodes_vacances").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── Jours de fermeture ───────────────────────────────────────────────────
    case "insert_fermeture": {
      const { date, motif } = body as { date: string; motif?: string };
      if (!date) return json({ error: "Missing date" }, 400);
      const { error } = await getSupabase()
        .from("jours_fermeture")
        .insert({ date, motif: motif || null });
      if (error) return json({ error: error.message, code: error.code }, 500);
      return json({ ok: true });
    }

    case "delete_fermeture": {
      const { id } = body as { id: string };
      if (!id) return json({ error: "Missing id" }, 400);
      const { error } = await getSupabase().from("jours_fermeture").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── Réassignation de box ─────────────────────────────────────────────────
    case "reassign_reservation_box": {
      const { reservation_id, box_ids } = body as { reservation_id: string; box_ids: string[] };
      if (!reservation_id || !Array.isArray(box_ids) || !box_ids.length)
        return json({ error: "Missing params" }, 400);
      const { error: delErr } = await getSupabase()
        .from("reservation_boxes")
        .delete()
        .eq("reservation_id", reservation_id);
      if (delErr) return json({ error: delErr.message }, 500);
      const { error: insErr } = await getSupabase()
        .from("reservation_boxes")
        .insert(box_ids.map(box_id => ({ reservation_id, box_id })));
      if (insErr) return json({ error: insErr.message }, 500);
      return json({ ok: true });
    }

    // ── Marketing / campagnes Mailjet ────────────────────────────────────────
    case "create_campaign": {
      const { segment, clients } = body as {
        segment?: string;
        clients?: { nom?: string; email?: string }[];
      };
      if (segment !== "fideles" && segment !== "inactifs")
        return json({ error: "Segment invalide (attendu: fideles ou inactifs)" }, 400);
      if (!Array.isArray(clients) || !clients.length)
        return json({ error: "Aucun client fourni pour ce segment" }, 400);

      const creds = mailjetCreds();
      if (!creds) return json({ error: "Configuration Mailjet absente" }, 500);

      const senderEmail = process.env.MAILJET_SENDER_EMAIL || "contact@vr-cafe.fr";
      const normalizedClients = clients
        .map((c) => ({ nom: String(c.nom ?? ""), email: String(c.email ?? "").trim() }))
        .filter((c) => c.email);
      if (!normalizedClients.length)
        return json({ error: "Aucun client de ce segment n'a d'email valide" }, 400);

      try {
        const result = await createSegmentCampaign({ segment, clients: normalizedClients, senderEmail, ...creds });
        return json({ ok: true, ...result });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Erreur Mailjet inconnue" }, 500);
      }
    }

    // ── Config clé-valeur ────────────────────────────────────────────────────
    case "set_config": {
      const { cle, valeur } = body as { cle: string; valeur: string | null };
      if (!cle) return json({ error: "Missing cle" }, 400);
      if (valeur === null) {
        const { error } = await getSupabase().from("config").delete().eq("cle", cle);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await getSupabase().from("config").upsert({ cle, valeur }, { onConflict: "cle" });
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
};

export const config: Config = {
  path: "/api/admin/db",
};
