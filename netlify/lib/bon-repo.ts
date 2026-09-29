// Accès à la table `bons_cadeaux` (service role uniquement : la table est sous RLS
// sans aucune policy). Isolé derrière une interface pour que les tests utilisent
// un stockage en mémoire.
import { createClient } from "@supabase/supabase-js";
import type { BonStatut } from "../../src/lib/bons-cadeaux.ts";

export interface Bon {
  id: string;
  code: string | null;
  offre: string;
  offre_label: string;
  montant: number;
  acheteur_nom: string;
  acheteur_email: string | null;
  beneficiaire_nom: string;
  message: string | null;
  statut: BonStatut;
  mode_paiement: "en_ligne" | "comptoir";
  sandbox: boolean;
  sumup_checkout_id: string | null;
  sumup_transaction_code: string | null;
  paye_le: string | null;
  expire_le: string | null;
  utilise_le: string | null;
  email_envoye_le: string | null;
  reservation_id: string | null;
  montant_rembourse: number;
  created_at: string;
  /** Réservation rattachée (lecture admin uniquement) */
  reservation?: { creneau_debut: string; statut: string } | null;
}

/** Réservation vue depuis un bon (rattachement au formulaire de réservation). */
export interface BonReservation {
  id: string;
  statut: string;
  created_at: string;
  type_reservation: string | null;
  duree_minutes: number;
  nb_personnes: number;
}

export type NewBon = Omit<Bon, "created_at" | "reservation" | "reservation_id" | "montant_rembourse" | "code" | "sumup_checkout_id" | "sumup_transaction_code" | "paye_le" | "expire_le" | "utilise_le" | "email_envoye_le" | "sandbox" | "mode_paiement"> &
  Partial<Pick<Bon, "code" | "paye_le" | "expire_le" | "mode_paiement" | "sandbox">>;

/** Erreur d'unicité Postgres (code déjà attribué) : l'appelant retente avec un autre code. */
export class DuplicateCodeError extends Error {}

export interface BonRepo {
  getById(id: string): Promise<Bon | null>;
  getByCheckoutId(checkoutId: string): Promise<Bon | null>;
  getByCode(code: string): Promise<Bon | null>;
  listByReservation(reservationId: string): Promise<Bon[]>;
  getReservation(id: string): Promise<BonReservation | null>;
  /** Rattache le bon (encore valide) à une réservation, seulement s'il est rattaché à `from` (null = libre). */
  attachReservation(bonId: string, reservationId: string, from: string | null): Promise<Bon | null>;
  insert(bon: NewBon): Promise<Bon>;
  /** Met à jour le bon, seulement s'il est encore dans l'un des statuts `ifStatut` ; null sinon. */
  update(id: string, patch: Partial<Bon>, ifStatut?: BonStatut[]): Promise<Bon | null>;
  list(limit: number): Promise<Bon[]>;
  /** Bons payés en ligne, encore valides, payés depuis `sinceIso` : à vérifier chez SumUp (remboursement). */
  listRefundCandidates(sinceIso: string): Promise<Bon[]>;
}

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

function check<T>(res: { data: T; error: { code?: string; message: string } | null }): T {
  if (res.error) {
    if (res.error.code === "23505" && res.error.message.includes("code")) throw new DuplicateCodeError(res.error.message);
    throw new Error(`Supabase bons_cadeaux : ${res.error.message}`);
  }
  return res.data;
}

const toBon = (row: any): Bon => ({ ...row, montant: Number(row.montant), montant_rembourse: Number(row.montant_rembourse ?? 0) });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getBonRepo(): BonRepo {
  const url = getEnv("PUBLIC_SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Variables Supabase (service role) manquantes");
  // Pas de type Database généré pour supabase-js (même limitation que admin-db.mts)
  const client = createClient(url, key);
  const table = () => client.from("bons_cadeaux") as any;

  return {
    async getById(id) {
      const row = check(await table().select("*").eq("id", id).maybeSingle());
      return row ? toBon(row) : null;
    },
    async getByCheckoutId(checkoutId) {
      const row = check(await table().select("*").eq("sumup_checkout_id", checkoutId).maybeSingle());
      return row ? toBon(row) : null;
    },
    async getByCode(code) {
      const row = check(await table().select("*").eq("code", code).maybeSingle());
      return row ? toBon(row) : null;
    },
    async listByReservation(reservationId) {
      if (!UUID_RE.test(reservationId)) return [];
      const rows = check(await table().select("*").eq("reservation_id", reservationId).order("created_at")) as any[];
      return (rows ?? []).map(toBon);
    },
    async getReservation(id) {
      if (!UUID_RE.test(id)) return null;
      return check(await client.from("reservations")
        .select("id, statut, created_at, type_reservation, duree_minutes, nb_personnes")
        .eq("id", id).maybeSingle()) as BonReservation | null;
    },
    async attachReservation(bonId, reservationId, from) {
      let q = table().update({ reservation_id: reservationId }).eq("id", bonId).eq("statut", "valide");
      q = from === null ? q.is("reservation_id", null) : q.eq("reservation_id", from);
      const row = check(await q.select("*").maybeSingle());
      return row ? toBon(row) : null;
    },
    async insert(bon) {
      return toBon(check(await table().insert(bon).select("*").single()));
    },
    async update(id, patch, ifStatut) {
      let q = table().update(patch).eq("id", id);
      if (ifStatut) q = q.in("statut", ifStatut);
      const row = check(await q.select("*").maybeSingle());
      return row ? toBon(row) : null;
    },
    async listRefundCandidates(sinceIso) {
      const rows = check(await table().select("*")
        .eq("mode_paiement", "en_ligne").eq("statut", "valide")
        .not("sumup_transaction_code", "is", null)
        .gte("paye_le", sinceIso)) as any[];
      return (rows ?? []).map(toBon);
    },
    async list(limit) {
      const rows = check(await table().select("*, reservation:reservations ( creneau_debut, statut )").order("created_at", { ascending: false }).limit(limit)) as any[];
      return (rows ?? []).map(toBon);
    },
  };
}
