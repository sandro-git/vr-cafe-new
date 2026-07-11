-- ============================================================
-- Validation anti-spam sur `reservations` — VR Café
-- À exécuter dans Supabase > SQL Editor (après clients.sql)
-- ============================================================
-- Bloque au niveau base de données les emails/téléphones bidons
-- (ex: test@exemple.com, 06 12 34 56 78) même si l'insertion
-- contourne la validation JS du formulaire (appel direct à l'API
-- Supabase avec la clé anon). Reprend la même logique que
-- src/lib/reservation-validation.ts (à garder synchronisé).
--
-- Le téléphone peut désormais être international (sélecteur de pays
-- côté formulaire, ex: "+34 612 34 56 78"). PL/pgSQL ne peut pas exécuter
-- libphonenumber-js : la validation ici reste un garde-fou générique
-- (format international plausible + détection de valeurs bidons),
-- pas une validation précise par pays — celle-ci est faite côté client.
-- ============================================================

CREATE OR REPLACE FUNCTION check_reservation_contact()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_email_domain text;
  v_phone_clean text;   -- espaces/points/tirets retirés, "+" conservé
  v_phone_legacy text;  -- forme française historique normalisée (0X XX XX XX XX)
  v_digits_only text;   -- uniquement des chiffres (sans "+")
  v_tail text;          -- 8 derniers chiffres, indépendant de l'indicatif pays
  v_ascending boolean;
  v_descending boolean;
  i int;
BEGIN
  -- Email : optionnel (réservations admin saisies par téléphone, sans email connu).
  -- S'il est fourni, il doit avoir un format valide et un domaine non-bidon.
  IF NEW.client_email IS NOT NULL AND NEW.client_email <> '' THEN
    IF NEW.client_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN
      RAISE EXCEPTION 'Adresse email invalide.';
    END IF;

    v_email_domain := lower(split_part(NEW.client_email, '@', 2));
    IF v_email_domain = ANY (ARRAY[
      'exemple.com', 'exemple.fr', 'example.com', 'example.org', 'example.net',
      'test.com', 'test.fr', 'mdj.fr'
    ]) THEN
      RAISE EXCEPTION 'Merci de renseigner une vraie adresse email.';
    END IF;
  END IF;

  -- Téléphone : format plausible — soit français historique (0X XX XX XX XX,
  -- avec ou sans indicatif), soit international générique (+ suivi de 7 à 15 chiffres).
  IF NEW.client_telephone IS NULL THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide.';
  END IF;

  v_phone_clean := regexp_replace(NEW.client_telephone, '[\s.-]', '', 'g');

  IF NOT (
    NEW.client_telephone ~ '^(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}$'
    OR v_phone_clean ~ '^\+[1-9]\d{6,14}$'
  ) THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide.';
  END IF;

  -- Téléphone : valeurs bidons connues (placeholder), en forme française historique et E.164
  v_phone_legacy := regexp_replace(v_phone_clean, '^(?:\+33|0033)', '0');
  IF v_phone_legacy IN ('0612345678', '0612346878')
     OR v_phone_clean IN ('+33612345678', '+33612346878')
  THEN
    RAISE EXCEPTION 'Merci de renseigner votre vrai numéro de téléphone.';
  END IF;

  -- Téléphone : séquences/répétitions bidons, sur les 8 derniers chiffres
  -- (indépendant de l'indicatif pays, donc valable pour tous les pays).
  v_digits_only := regexp_replace(v_phone_clean, '\+', '', 'g');
  IF length(v_digits_only) >= 8 THEN
    v_tail := right(v_digits_only, 8);

    IF v_tail ~ '^(\d)\1+$' THEN
      RAISE EXCEPTION 'Merci de renseigner votre vrai numéro de téléphone.';
    END IF;

    v_ascending := true;
    v_descending := true;
    FOR i IN 2..length(v_tail) LOOP
      IF substring(v_tail from i for 1)::int <> (substring(v_tail from i - 1 for 1)::int + 1) % 10 THEN
        v_ascending := false;
      END IF;
      IF substring(v_tail from i for 1)::int <> (substring(v_tail from i - 1 for 1)::int + 9) % 10 THEN
        v_descending := false;
      END IF;
    END LOOP;

    IF v_ascending OR v_descending THEN
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
