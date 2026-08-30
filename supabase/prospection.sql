-- ============================================================
-- Table PROSPECTION — VR Café
-- À exécuter dans Supabase > SQL Editor
-- ============================================================
-- Contacts de prospection à relancer par email. Le dashboard admin
-- (/admin/prospection, à venir) sélectionne des contacts et déclenche
-- l'envoi groupé via la Supabase Edge Function
-- supabase/functions/send-prospection, qui appelle l'API REST Brevo
-- (intégration indépendante de Mailjet, utilisé pour clients/réservations).
-- ============================================================

CREATE TABLE IF NOT EXISTS prospection (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text,
  email       text NOT NULL,
  telephone   text,
  statut      text NOT NULL DEFAULT 'a_relancer'
                CHECK (statut IN ('a_relancer', 'relance_envoyee', 'erreur_envoi')),
  date_envoi  timestamptz,
  erreur      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospection_statut_idx ON prospection (statut);

-- Aucun accès anon/authenticated : toutes les opérations passent par la
-- service role key (Edge Function + futur back-office).
ALTER TABLE prospection ENABLE ROW LEVEL SECURITY;
