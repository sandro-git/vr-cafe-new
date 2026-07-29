-- ============================================================
-- Table AVIS_GOOGLE — VR Café
-- À exécuter dans Supabase > SQL Editor
-- ============================================================
-- Avis Google Business Profile synchronisés par le poller
-- (netlify/functions/poll-google-reviews.mts), avec brouillon de réponse
-- généré par IA et validé manuellement dans /admin/avis avant publication
-- via l'API Google Business Profile. Indépendant du système d'avis manuel
-- Sanity (type `avis`) utilisé pour l'affichage public des témoignages.
-- ============================================================

CREATE TABLE IF NOT EXISTS avis_google (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_review_id       text NOT NULL UNIQUE,   -- "accounts/.../locations/.../reviews/xxx"
  auteur_nom             text,
  auteur_photo_url       text,
  note                   smallint NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire            text,
  date_avis              timestamptz NOT NULL,    -- createTime Google
  date_modification_avis timestamptz,              -- updateTime Google
  brouillon_reponse      text,
  statut                 text NOT NULL DEFAULT 'en_attente'
                           CHECK (statut IN ('en_attente', 'publie', 'rejete')),
  erreur_publication     text,
  date_publication       timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS avis_google_statut_idx ON avis_google (statut);
CREATE INDEX IF NOT EXISTS avis_google_date_avis_idx ON avis_google (date_avis DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION avis_google_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_avis_google_updated_at ON avis_google;
CREATE TRIGGER trg_avis_google_updated_at
  BEFORE UPDATE ON avis_google
  FOR EACH ROW EXECUTE FUNCTION avis_google_set_updated_at();

-- RLS : lecture anon publique (cohérent avec clients/reservations — la
-- protection réelle est le cookie admin_session + middleware sur /admin/*),
-- écritures via service role uniquement (netlify/functions/admin-avis.mts
-- et poll-google-reviews.mts).
ALTER TABLE avis_google ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read" ON avis_google
  FOR SELECT TO anon, authenticated USING (true);
