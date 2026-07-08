export function calcMontant(dureeMinutes: number, nbPersonnes: number): number | null {
  if (dureeMinutes === 30) return 18 * nbPersonnes;
  if (dureeMinutes === 60) return (nbPersonnes <= 2 ? 29 : nbPersonnes <= 4 ? 27 : 25) * nbPersonnes;
  return null;
}
