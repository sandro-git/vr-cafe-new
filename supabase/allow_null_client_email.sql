-- ============================================================
-- Autoriser client_email NULL sur `reservations` — VR Café
-- À exécuter dans Supabase > SQL Editor
-- ============================================================
-- Le commit "feat(reservation): rendre l'email optionnel pour les
-- réservations admin" a rendu l'email optionnel côté application
-- (validation JS, trigger check_reservation_contact, fonction Netlify
-- reservation-confirmation) mais la colonne reservations.client_email
-- était restée NOT NULL en base. Résultat : toute réservation admin
-- créée sans email échouait à l'insertion avec l'erreur Postgres
-- "null value in column \"client_email\" of relation \"reservations\"
-- violates not-null constraint".
-- ============================================================

ALTER TABLE public.reservations ALTER COLUMN client_email DROP NOT NULL;
