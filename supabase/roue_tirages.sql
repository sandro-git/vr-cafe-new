-- ============================================================
-- Table ROUE_TIRAGES — VR Café
-- À exécuter dans Supabase > SQL Editor
-- ============================================================
-- Suivi des tirages de la roue de récompense (/roue). Un email ne peut
-- gagner qu'une seule fois (index unique sur lower(email)) — vérifié côté
-- serveur dans netlify/functions/roue.mts, le localStorage côté client ne
-- sert qu'au confort d'affichage, pas à la sécurité. Le code généré est
-- montré en caisse et validé/marqué "utilisé" depuis /admin/roue via
-- netlify/functions/admin-roue.mts. Les lots eux-mêmes (libellé, poids,
-- couleur) sont gérés dans Sanity (type `lotRoue`), pas ici.
-- ============================================================

CREATE TABLE IF NOT EXISTS roue_tirages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  lot_label    text NOT NULL,
  code         text NOT NULL UNIQUE,
  utilise      boolean NOT NULL DEFAULT false,
  utilise_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS roue_tirages_email_idx ON roue_tirages (lower(email));
CREATE INDEX IF NOT EXISTS roue_tirages_code_idx ON roue_tirages (code);

-- RLS : contrairement à avis_google/clients, cette table contient des emails
-- clients donc aucune policy anon — lecture/écriture uniquement via le
-- service role, depuis netlify/functions/roue.mts et admin-roue.mts.
ALTER TABLE roue_tirages ENABLE ROW LEVEL SECURITY;
