-- ============================================================
-- Table CLIENTS — VR Café
-- À exécuter dans Supabase > SQL Editor (après rls_policies.sql)
-- ============================================================
-- Crée une véritable table `clients` (source de vérité de l'identité client),
-- reliée à `reservations` via `client_id`. Les réservations conservent leurs
-- champs dénormalisés (client_nom/email/telephone) utilisés par les emails,
-- le marketing et l'autocomplete.
-- ============================================================

-- 1. Table clients
CREATE TABLE IF NOT EXISTS clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text,
  email       text,
  telephone   text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Unicité sur l'email normalisé (clé naturelle), en ignorant les emails vides
CREATE UNIQUE INDEX IF NOT EXISTS clients_email_unique
  ON clients (lower(email)) WHERE email IS NOT NULL AND email <> '';

-- 2. Lien sur reservations (supprimer un client supprime ses réservations)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS reservations_client_id_idx ON reservations (client_id);

-- 2b. S'assurer que reservation_boxes cascade bien à la suppression d'une réservation.
--     Défense en profondeur : la suppression côté backend efface déjà les box
--     explicitement, mais on garantit ici la cascade. Le nom réel de la contrainte
--     FK est résolu dynamiquement (ne pas présumer du nom par défaut).
DO $$
DECLARE v_con text;
BEGIN
  SELECT con.conname INTO v_con
  FROM pg_constraint con
  JOIN pg_class rel  ON rel.oid = con.conrelid
  JOIN pg_class fref ON fref.oid = con.confrelid
  WHERE con.contype = 'f'
    AND rel.relname  = 'reservation_boxes'
    AND fref.relname = 'reservations'
  LIMIT 1;

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE reservation_boxes DROP CONSTRAINT %I', v_con);
  END IF;

  ALTER TABLE reservation_boxes
    ADD CONSTRAINT reservation_boxes_reservation_id_fkey
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
END $$;

-- 3. Trigger d'alimentation (find-or-create) — alimente client_id à l'insertion
--    SECURITY DEFINER : l'insert anon public (formulaire de réservation) reste
--    inchangé et peut créer un client sans policy anon en écriture sur `clients`.
CREATE OR REPLACE FUNCTION link_reservation_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  IF NEW.client_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.client_email IS NOT NULL AND NEW.client_email <> '' THEN
    SELECT id INTO v_id
    FROM clients
    WHERE lower(email) = lower(NEW.client_email)
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO clients (nom, email, telephone)
    VALUES (NEW.client_nom, NEW.client_email, NEW.client_telephone)
    RETURNING id INTO v_id;
  END IF;

  NEW.client_id := v_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_link_reservation_client ON reservations;
CREATE TRIGGER trg_link_reservation_client
  BEFORE INSERT ON reservations
  FOR EACH ROW EXECUTE FUNCTION link_reservation_client();

-- 4. Backfill des données existantes
--    Un client par email distinct (nom/téléphone = ceux de la résa la plus récente)
INSERT INTO clients (nom, email, telephone)
SELECT DISTINCT ON (lower(client_email))
       client_nom, client_email, client_telephone
FROM reservations
WHERE client_email IS NOT NULL AND client_email <> ''
ORDER BY lower(client_email), creneau_debut DESC
ON CONFLICT DO NOTHING;

--    Rattacher les réservations existantes
UPDATE reservations r
SET client_id = c.id
FROM clients c
WHERE r.client_id IS NULL
  AND r.client_email IS NOT NULL
  AND lower(r.client_email) = lower(c.email);

-- 5. RLS : lecture anon publique (cohérent avec reservations),
--    écritures via service role (admin-db) + trigger SECURITY DEFINER
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read" ON clients
  FOR SELECT TO anon, authenticated USING (true);
