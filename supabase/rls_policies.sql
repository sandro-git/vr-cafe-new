-- ============================================================
-- RLS Policies — VR Café Booking
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- 1. Activer RLS sur toutes les tables
ALTER TABLE config              ENABLE ROW LEVEL SECURITY;
ALTER TABLE boxes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE durees_session      ENABLE ROW LEVEL SECURITY;
ALTER TABLE jours_fermeture     ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodes_vacances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_boxes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fermetures          ENABLE ROW LEVEL SECURITY;

-- 2. Tables de référence : lecture publique (aucune donnée sensible)
CREATE POLICY "anon_read" ON config
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon_read" ON boxes
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon_read" ON durees_session
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon_read" ON jours_fermeture
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon_read" ON periodes_vacances
  FOR SELECT TO anon, authenticated USING (true);

-- 3. Reservations : lecture publique (nécessaire pour vérifier les créneaux)
--    + insertion publique (formulaire de réservation)
--    Les écritures admin (UPDATE/DELETE) passent par la service role key côté serveur.
CREATE POLICY "anon_read" ON reservations
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon_insert" ON reservations
  FOR INSERT TO anon WITH CHECK (true);

-- 4. Reservation_boxes : même logique
CREATE POLICY "anon_read" ON reservation_boxes
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon_insert" ON reservation_boxes
  FOR INSERT TO anon WITH CHECK (true);

-- 5. Fermetures (table legacy) : lecture publique
CREATE POLICY "anon_read" ON fermetures
  FOR SELECT TO anon, authenticated USING (true);

-- 6. Push subscriptions : aucun accès anon
--    Les opérations passent par la service role key (fonction Netlify).
--    (Pas de policy anon → accès refusé par défaut)
