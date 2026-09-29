-- ============================================================
-- Remboursements des bons cadeaux — VR Café
-- À exécuter dans Supabase > SQL Editor (appliqué en prod le 29/09/2026)
-- ============================================================
-- Montant déjà remboursé sur la transaction SumUp du bon :
-- - bouton « Rembourser et annuler » de /admin/bons (remboursement via l'API SumUp) ;
-- - vérification horaire (fonction planifiée sumup-remboursements) des remboursements
--   faits depuis le tableau de bord SumUp : SumUp n'envoie aucun webhook pour un remboursement.
-- Sert aussi à ne prévenir l'admin qu'une fois par remboursement.

ALTER TABLE bons_cadeaux
  ADD COLUMN IF NOT EXISTS montant_rembourse numeric(8,2) NOT NULL DEFAULT 0 CHECK (montant_rembourse >= 0);
