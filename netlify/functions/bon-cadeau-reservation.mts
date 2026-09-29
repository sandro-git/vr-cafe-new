import type { Context, Config } from "@netlify/functions";
import { getBonRepo } from "../lib/bon-repo.ts";
import { attachBonToReservation, bonPublic, checkBonUtilisable } from "../lib/bon-cadeau.ts";
import { verifyReservationToken } from "../lib/reservation-token.ts";
import { BON_REFUS_MESSAGES } from "../../src/lib/bons-cadeaux.ts";

// Champ « Bon cadeau » du formulaire de réservation :
// - POST /api/bon-cadeau/verifier  { code, remplace_id?, token? }            → infos du bon ou motif de refus
// - POST /api/bon-cadeau/rattacher { code, reservation_id, remplace_id?, token? }
//   (appelé juste après la création de la réservation : fenêtre de 10 min, cf. attachBonToReservation)
// `remplace_id` + `token` : modification d'une réservation ; ses bons peuvent passer à la nouvelle.

const ALLOWED_ORIGINS = [
  "https://vr-cafe.fr",
  "https://www.vr-cafe.fr",
  "http://localhost:4321",
  "http://localhost:8888",
];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: "Forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Lien de modification : n'est pris en compte que si son jeton est valide
  const remplaceId =
    typeof body.remplace_id === "string" && typeof body.token === "string" && (await verifyReservationToken(body.remplace_id, body.token))
      ? body.remplace_id
      : null;

  try {
    const repo = getBonRepo();
    const action = new URL(req.url).pathname.split("/").pop();

    if (action === "verifier") {
      const check = await checkBonUtilisable(repo, body.code, { remplaceId });
      return check.ok
        ? json({ ok: true, bon: bonPublic(check.bon) })
        : json({ ok: false, raison: check.raison, error: BON_REFUS_MESSAGES[check.raison] });
    }

    if (action === "rattacher") {
      if (typeof body.reservation_id !== "string") return json({ error: "reservation_id manquant" }, 400);
      const res = await attachBonToReservation(repo, body.code, body.reservation_id, { remplaceId });
      if (res.ok) return json({ ok: true, bon: bonPublic(res.bon) });
      const error = res.raison === "reservation" ? "Réservation introuvable ou trop ancienne." : BON_REFUS_MESSAGES[res.raison];
      return json({ ok: false, raison: res.raison, error }, 409);
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("bon-cadeau-reservation", err);
    return json({ error: "Erreur serveur" }, 500);
  }
};

export const config: Config = {
  path: ["/api/bon-cadeau/verifier", "/api/bon-cadeau/rattacher"],
};
