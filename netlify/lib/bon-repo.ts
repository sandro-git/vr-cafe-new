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
  created_at: string;
}

export type NewBon = Omit<Bon, "created_at" | "code" | "sumup_checkout_id" | "sumup_transaction_code" | "paye_le" | "expire_le" | "utilise_le" | "email_envoye_le" | "sandbox" | "mode_paiement"> &
  Partial<Pick<Bon, "code" | "paye_le" | "expire_le" | "mode_paiement" | "sandbox">>;

/** Erreur d'unicité Postgres (code déjà attribué) : l'appelant retente avec un autre code. */
export class DuplicateCodeError extends Error {}

export interface BonRepo {
  getById(id: string): Promise<Bon | null>;
  getByCheckoutId(checkoutId: string): Promise<Bon | null>;
  insert(bon: NewBon): Promise<Bon>;
  /** Met à jour le bon, seulement s'il est encore dans l'un des statuts `ifStatut` ; null sinon. */
  update(id: string, patch: Partial<Bon>, ifStatut?: BonStatut[]): Promise<Bon | null>;
  list(limit: number): Promise<Bon[]>;
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

const toBon = (row: any): Bon => ({ ...row, montant: Number(row.montant) });

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
    async insert(bon) {
      return toBon(check(await table().insert(bon).select("*").single()));
    },
    async update(id, patch, ifStatut) {
      let q = table().update(patch).eq("id", id);
      if (ifStatut) q = q.in("statut", ifStatut);
      const row = check(await q.select("*").maybeSingle());
      return row ? toBon(row) : null;
    },
    async list(limit) {
      const rows = check(await table().select("*").order("created_at", { ascending: false }).limit(limit)) as any[];
      return (rows ?? []).map(toBon);
    },
  };
}
