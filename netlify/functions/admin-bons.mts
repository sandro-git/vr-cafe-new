// API admin des bons cadeaux (/admin/bons) : liste, utilisation au comptoir, annulation,
// renvoi de l'email, saisie d'un bon vendu au TPE. Même pattern d'auth que admin-avis.mts.
import type { Context, Config } from "@netlify/functions";
import { isAdminRequest } from "../lib/admin-session.ts";
import { getBonRepo, type Bon } from "../lib/bon-repo.ts";
import { createComptoirBon, deliverBon, refundBon } from "../lib/bon-cadeau.ts";
import { readSumUpConfig } from "../lib/sumup.ts";
import { BON_MESSAGE_MAX, BON_NOM_MAX, getOffreBon } from "../../src/lib/bons-cadeaux.ts";
import { isValidEmail } from "../../src/lib/reservation-validation.ts";

const LIST_LIMIT = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await isAdminRequest(req))) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { action } = body;
  const id = str(body.id);
  if (action !== "list" && action !== "create_comptoir" && !UUID_RE.test(id)) return json({ error: "id invalide" }, 400);

  try {
    const repo = getBonRepo();
    const updated = (bon: Bon | null, error: string) => (bon ? json({ data: bon }) : json({ error }, 409));

    switch (action) {
      case "list":
        return json({ data: await repo.list(LIST_LIMIT) });

      case "mark_used":
        return updated(
          await repo.update(id, { statut: "utilise", utilise_le: new Date().toISOString() }, ["valide"]),
          "Ce bon n'est pas (ou plus) valide.",
        );

      case "unmark_used":
        return updated(
          await repo.update(id, { statut: "valide", utilise_le: null }, ["utilise"]),
          "Ce bon n'est pas marqué comme utilisé.",
        );

      case "cancel":
        return updated(await repo.update(id, { statut: "annule" }, ["valide"]), "Seul un bon valide peut être annulé.");

      // Rembourse le paiement SumUp puis annule le bon (irréversible : confirmé côté page)
      case "refund": {
        const sumup = readSumUpConfig();
        if (!sumup) return json({ error: "SumUp n'est pas configuré." }, 503);
        const res = await refundBon(repo, sumup, id);
        return res.ok ? json({ data: res.bon, deja_rembourse: res.dejaRembourse }) : json({ error: res.error }, res.status);
      }

      case "resend_email": {
        const bon = await repo.getById(id);
        if (!bon || (bon.statut !== "valide" && bon.statut !== "utilise")) return json({ error: "Bon non valide" }, 409);
        if (!bon.acheteur_email) return json({ error: "Aucun email pour ce bon" }, 409);
        const { bon: sent, emailSent } = await deliverBon(repo, bon, { notifyAdmin: false });
        return emailSent ? json({ data: sent }) : json({ error: "L'email n'a pas pu être envoyé." }, 502);
      }

      case "create_comptoir": {
        const offre = getOffreBon(body.offre);
        const acheteur_nom = str(body.acheteur_nom);
        const beneficiaire_nom = str(body.beneficiaire_nom);
        const acheteur_email = str(body.acheteur_email).toLowerCase() || null;
        const message = str(body.message) || null;
        if (!offre) return json({ error: "Offre inconnue" }, 400);
        if (!acheteur_nom || acheteur_nom.length > BON_NOM_MAX) return json({ error: "Nom de l'acheteur requis" }, 400);
        if (!beneficiaire_nom || beneficiaire_nom.length > BON_NOM_MAX) return json({ error: "Nom du bénéficiaire requis" }, 400);
        if (acheteur_email && !isValidEmail(acheteur_email)) return json({ error: "Email invalide" }, 400);
        if (message && message.length > BON_MESSAGE_MAX) return json({ error: "Message trop long" }, 400);
        const bon = await createComptoirBon(repo, { offre, acheteur_nom, acheteur_email, beneficiaire_nom, message });
        return json({ data: bon });
      }

      default:
        return json({ error: "Action inconnue" }, 400);
    }
  } catch (err) {
    console.error("admin-bons", action, err);
    return json({ error: "Erreur serveur" }, 500);
  }
};

export const config: Config = {
  path: "/api/admin/bons",
};
