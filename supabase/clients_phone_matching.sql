-- ============================================================
-- Rattachement CRM par téléphone — VR Café
-- À exécuter dans Supabase > SQL Editor (après clients.sql)
-- ============================================================
-- Les réservations admin peuvent désormais être créées sans email (client
-- connu seulement par téléphone). Sans ce correctif, link_reservation_client()
-- (clients.sql) créerait une nouvelle fiche `clients` à chaque réservation
-- sans email, même pour un client régulier déjà connu par son téléphone.
-- On ajoute donc un matching par téléphone en repli du matching par email.
-- ============================================================

-- Unicité sur le téléphone (miroir de clients_email_unique) — vérifié en amont
-- qu'aucun doublon n'existe déjà en base avant d'ajouter cette contrainte.
CREATE UNIQUE INDEX IF NOT EXISTS clients_telephone_unique
  ON clients (telephone) WHERE telephone IS NOT NULL AND telephone <> '';

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

  -- Repli par téléphone si pas d'email (ou email non trouvé) — permet de
  -- retrouver un client régulier saisi en admin sans email.
  IF v_id IS NULL AND NEW.client_telephone IS NOT NULL AND NEW.client_telephone <> '' THEN
    SELECT id INTO v_id
    FROM clients
    WHERE telephone = NEW.client_telephone
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
