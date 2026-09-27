-- ============================================================
-- Notification push des nouvelles réservations — VR Café
-- À exécuter dans Supabase > SQL Editor
-- ============================================================
-- /api/push-notify est appelé depuis le navigateur (formulaires publics) :
-- il ne reçoit plus que l'id de la réservation et marque cette colonne
-- de façon atomique (UPDATE ... WHERE push_notifie_le IS NULL) avant
-- d'envoyer. Une réservation ne déclenche donc qu'une seule notification,
-- et le texte est construit côté serveur à partir de la base.
-- Écrite uniquement par la fonction Netlify (service role) : aucune policy
-- anon n'autorise l'UPDATE de `reservations`.

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS push_notifie_le timestamptz;
