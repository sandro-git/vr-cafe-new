-- ============================================================
-- Bons cadeaux — VR Café
-- À exécuter dans Supabase > SQL Editor (appliqué en prod le 28/09/2026)
-- ============================================================
-- Un bon = une expérience précise (ex. « 1h duo »), utilisable en une fois.
-- Vente en ligne via SumUp (Hosted Checkout) ou au comptoir (saisie admin).
--
-- Cycle : en_attente (paiement lancé) → valide (payé, code attribué)
--         → utilise (marqué depuis /admin/bons) ; ou echec / annule.
-- « Expiré » n'est pas un statut : valide + expire_le dépassé.
--
-- Données personnelles (acheteur, bénéficiaire) : RLS activée SANS aucune
-- policy → illisible et non modifiable avec la clé anon. Tout passe par les
-- fonctions Netlify (service role).

CREATE TABLE IF NOT EXISTS bons_cadeaux (
  id                     uuid PRIMARY KEY,
  code                   text UNIQUE,
  offre                  text NOT NULL,
  offre_label            text NOT NULL,
  montant                numeric(8,2) NOT NULL CHECK (montant > 0),
  acheteur_nom           text NOT NULL,
  acheteur_email         text,
  beneficiaire_nom       text NOT NULL,
  message                text,
  statut                 text NOT NULL DEFAULT 'en_attente'
                         CHECK (statut IN ('en_attente', 'valide', 'utilise', 'annule', 'echec')),
  mode_paiement          text NOT NULL DEFAULT 'en_ligne'
                         CHECK (mode_paiement IN ('en_ligne', 'comptoir')),
  sandbox                boolean NOT NULL DEFAULT false,
  sumup_checkout_id      text UNIQUE,
  sumup_transaction_code text,
  paye_le                timestamptz,
  expire_le              timestamptz,
  utilise_le             timestamptz,
  email_envoye_le        timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bons_cadeaux_created_at_idx ON bons_cadeaux (created_at DESC);

ALTER TABLE bons_cadeaux ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bons_cadeaux FROM anon, authenticated;
