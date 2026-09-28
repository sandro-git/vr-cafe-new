import type { Context, Config } from "@netlify/functions";
import { getBonRepo } from "../lib/bon-repo.ts";
import { finalizeBon } from "../lib/bon-cadeau.ts";
import { readSumUpConfig } from "../lib/sumup.ts";

// Page /cadeaux/merci : le client revient de SumUp avec l'id du bon (UUID aléatoire, connu de
// lui seul). On revérifie le paiement chez SumUp (utile si le webhook n'est pas encore arrivé,
// ou en local où SumUp ne peut pas le joindre), puis on renvoie l'état du bon.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** `jean.dupont@gmail.com` → `j•••@gmail.com` */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  return domain ? `${user.slice(0, 1)}•••@${domain}` : null;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const id = new URL(req.url).searchParams.get("bon") ?? "";
  if (!UUID_RE.test(id)) return json({ error: "Bon introuvable" }, 404);

  try {
    const repo = getBonRepo();
    let bon = await repo.getById(id);
    if (!bon || bon.mode_paiement !== "en_ligne") return json({ error: "Bon introuvable" }, 404);

    const sumup = readSumUpConfig();
    if (bon.statut === "en_attente" && sumup) {
      try {
        bon = await finalizeBon(repo, sumup, bon);
      } catch (err) {
        console.error("bon-cadeau-statut : vérification SumUp impossible", err);
      }
    }

    const valide = bon.statut === "valide" || bon.statut === "utilise";
    return json({
      statut: bon.statut,
      offre_label: bon.offre_label,
      beneficiaire_nom: bon.beneficiaire_nom,
      acheteur_email: maskEmail(bon.acheteur_email),
      email_envoye: !!bon.email_envoye_le,
      ...(valide ? { code: bon.code, expire_le: bon.expire_le } : {}),
    });
  } catch (err) {
    console.error("bon-cadeau-statut", err);
    return json({ error: "Erreur serveur" }, 500);
  }
};

export const config: Config = {
  path: "/api/bon-cadeau/statut",
};
