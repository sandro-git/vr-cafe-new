-- ============================================================
-- Réservations et clients : plus de lecture avec la clé anon (RGPD)
-- ------------------------------------------------------------
-- La clé anon est publique (JS du site). Les policies `anon_read`
-- USING (true) permettaient à n'importe qui de lire noms, emails et
-- téléphones de toutes les réservations et de tous les clients.
--
-- ⚠️ À appliquer UNIQUEMENT après le déploiement du code qui :
--   - lit réservations et clients via /api/admin/db (service role) ;
--   - insère les réservations sans `.select()` (id généré côté navigateur).
-- Sinon : pages admin vides et formulaires de réservation en erreur.
-- ============================================================

BEGIN;

-- 1. La RPC de disponibilité doit continuer à voir toutes les réservations.
--    En SECURITY INVOKER, sans lecture anon, elle annoncerait toutes les
--    box libres (surréservation). Elle ne renvoie que box_id / box_nom.
--    search_path déjà fixé à 'public, pg_temp' dans sa définition.
ALTER FUNCTION public.get_boxes_disponibles(timestamptz, timestamptz, text) SECURITY DEFINER;

-- 2. Suppression des lectures anon / authenticated
DROP POLICY IF EXISTS "anon_read" ON public.reservations;
DROP POLICY IF EXISTS "anon_read" ON public.reservation_boxes;
DROP POLICY IF EXISTS "anon_read" ON public.clients;

-- Les policies "anon_insert" de reservations et reservation_boxes sont
-- conservées (formulaires publics). Les insertions de liens box via FK
-- ne nécessitent pas de droit SELECT (contrôle d'intégrité hors RLS).

COMMIT;

-- Vérification (doit renvoyer 0 ligne pour ces trois tables) :
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('reservations', 'reservation_boxes', 'clients')
--     AND cmd = 'SELECT';
--
-- Retour arrière (réexpose les données, à n'utiliser qu'en urgence) :
--   CREATE POLICY "anon_read" ON public.reservations FOR SELECT TO anon, authenticated USING (true);
--   CREATE POLICY "anon_read" ON public.reservation_boxes FOR SELECT TO anon, authenticated USING (true);
--   ALTER FUNCTION public.get_boxes_disponibles(timestamptz, timestamptz, text) SECURITY INVOKER;
