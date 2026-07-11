-- ============================================================
-- Validation anti-spam sur `reservations` — VR Café
-- À exécuter dans Supabase > SQL Editor (après clients.sql)
-- ============================================================
-- Bloque au niveau base de données les emails/téléphones bidons
-- (ex: test@exemple.com, 06 12 34 56 78) même si l'insertion
-- contourne la validation JS du formulaire (appel direct à l'API
-- Supabase avec la clé anon). Reprend la même logique que
-- src/lib/reservation-validation.ts (à garder synchronisé).
-- ============================================================

CREATE OR REPLACE FUNCTION check_reservation_contact()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_email_domain text;
  v_phone_digits text;
  v_phone_rest text;
BEGIN
  -- Email : format
  IF NEW.client_email IS NULL OR NEW.client_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN
    RAISE EXCEPTION 'Adresse email invalide.';
  END IF;

  -- Email : domaines bidons connus
  v_email_domain := lower(split_part(NEW.client_email, '@', 2));
  IF v_email_domain = ANY (ARRAY[
    'exemple.com', 'exemple.fr', 'example.com', 'example.org', 'example.net',
    'test.com', 'test.fr'
  ]) THEN
    RAISE EXCEPTION 'Merci de renseigner une vraie adresse email.';
  END IF;

  -- Téléphone : format (français, avec ou sans indicatif)
  IF NEW.client_telephone IS NULL
     OR NEW.client_telephone !~ '^(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}$'
  THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide (format français attendu).';
  END IF;

  -- Téléphone : valeurs bidons connues (placeholder, séquences, répétitions)
  v_phone_digits := regexp_replace(NEW.client_telephone, '[\s.-]', '', 'g');
  v_phone_digits := regexp_replace(v_phone_digits, '^(?:\+33|0033)', '0');

  IF v_phone_digits = '0612345678' THEN
    RAISE EXCEPTION 'Merci de renseigner votre vrai numéro de téléphone.';
  END IF;

  IF length(v_phone_digits) = 10 THEN
    -- Sous-nombre abonné (après le "0" et le chiffre de préfixe 06/07/...)
    v_phone_rest := substring(v_phone_digits from 3);
    IF v_phone_rest ~ '^(\d)\1+$' THEN
      RAISE EXCEPTION 'Merci de renseigner votre vrai numéro de téléphone.';
    END IF;

    IF v_phone_digits IN ('0123456789', '0987654321') THEN
      RAISE EXCEPTION 'Merci de renseigner votre vrai numéro de téléphone.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Uniquement sur INSERT (pas UPDATE) : on bloque les nouvelles réservations
-- bidons sans empêcher l'admin de modifier/annuler des réservations bidons
-- déjà existantes en base (cf. requête de nettoyage).
-- Nommé pour s'exécuter avant trg_link_reservation_client (ordre alphabétique
-- des triggers BEFORE INSERT de même niveau) : la validation doit avoir lieu
-- avant la création automatique du client lié.
DROP TRIGGER IF EXISTS trg_a_check_reservation_contact ON reservations;
CREATE TRIGGER trg_a_check_reservation_contact
  BEFORE INSERT ON reservations
  FOR EACH ROW EXECUTE FUNCTION check_reservation_contact();
