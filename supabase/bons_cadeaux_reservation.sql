-- ============================================================
-- Bons cadeaux utilisés dans une réservation — VR Café
-- À exécuter dans Supabase > SQL Editor (appliqué en prod le 29/09/2026)
-- ============================================================
-- Un bon « valide » rattaché à une réservation (champ « Bon cadeau » du formulaire)
-- ne peut plus être utilisé ailleurs. Rattachement fait uniquement par la fonction
-- Netlify /api/bon-cadeau/rattacher (service role). Plusieurs bons possibles par
-- réservation (ex. deux bons duo pour 4 joueurs).

ALTER TABLE bons_cadeaux
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bons_cadeaux_reservation_id_idx ON bons_cadeaux (reservation_id);

-- Réservation annulée (client, admin, modification…) → ses bons encore valides
-- redeviennent disponibles. Un bon déjà marqué « utilise » reste rattaché.
CREATE OR REPLACE FUNCTION liberer_bons_reservation_annulee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.statut = 'annulée' AND OLD.statut IS DISTINCT FROM 'annulée' THEN
    UPDATE bons_cadeaux SET reservation_id = NULL
    WHERE reservation_id = NEW.id AND statut = 'valide';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION liberer_bons_reservation_annulee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS liberer_bons_reservation_annulee ON reservations;
CREATE TRIGGER liberer_bons_reservation_annulee
  AFTER UPDATE OF statut ON reservations
  FOR EACH ROW EXECUTE FUNCTION liberer_bons_reservation_annulee();
