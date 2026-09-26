export function calcMontant(dureeMinutes: number, nbPersonnes: number): number | null {
  if (dureeMinutes === 30) return 18 * nbPersonnes;
  if (dureeMinutes === 60) return (nbPersonnes <= 2 ? 29 : nbPersonnes <= 4 ? 27 : 25) * nbPersonnes;
  return null;
}

/** Prix/pers. anniversaire par défaut, si le tarif Sanity (type "anniversaire") est indisponible. */
export const PRIX_ANNIVERSAIRE_DEFAUT = 25;

/**
 * Montant d'une réservation selon son type : anniversaire = prix/pers. du tarif Sanity × joueurs,
 * standard et MDJ = grille calcMontant.
 */
export function calcMontantReservation(
  typeReservation: string | null | undefined,
  dureeMinutes: number,
  nbPersonnes: number,
  prixAnniversaire: number = PRIX_ANNIVERSAIRE_DEFAUT,
): number | null {
  if (typeReservation === "anniversaire") return prixAnniversaire * nbPersonnes;
  return calcMontant(dureeMinutes, nbPersonnes);
}
