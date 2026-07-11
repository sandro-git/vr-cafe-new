-- ============================================================
-- Durcissement sécurité — VR Café
-- À exécuter dans Supabase > SQL Editor
-- ============================================================
-- Corrige deux alertes remontées par le linter de sécurité Supabase
-- (Database > Advisors) :
--
-- 1. function_search_path_mutable (WARN) : une fonction sans search_path
--    fixé peut être détournée si un rôle malveillant crée un objet de
--    même nom dans un schéma placé avant `public` dans le search_path.
--    Fixe le search_path sur les 3 fonctions concernées.
--
-- 2. anon_security_definer_function_executable / authenticated_... (WARN) :
--    `link_reservation_client()` est une fonction SECURITY DEFINER utilisée
--    uniquement comme trigger interne (cf. supabase/clients_phone_matching.sql),
--    mais elle était aussi appelable directement en RPC public
--    (`/rest/v1/rpc/link_reservation_client`) par anon/authenticated. Le
--    déclenchement automatique du trigger sur INSERT ne dépend pas du
--    privilège EXECUTE (seul l'INSERT sur `reservations`, gouverné par les
--    policies RLS existantes, est requis) — on peut donc retirer l'accès
--    RPC direct sans rien casser.
-- ============================================================

ALTER FUNCTION public.get_boxes_disponibles(timestamp with time zone, timestamp with time zone, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.check_reservation_contact()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.link_reservation_client()
  SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.link_reservation_client() FROM PUBLIC, anon, authenticated;
