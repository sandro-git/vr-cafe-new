// Bons cadeaux : une expérience précise (ex. « 1h duo »), utilisable en une fois.
// Partagé par la page publique /cadeaux, /admin/bons et les fonctions Netlify
// (le prix est toujours recalculé côté serveur à partir de l'id de l'offre).
import { calcMontant } from "./pricing";
import { isFakeEmail, isValidEmail } from "./reservation-validation";

export const BON_VALIDITE_MOIS = 12;
export const BON_NOM_MAX = 80;
export const BON_MESSAGE_MAX = 300;

export interface OffreBon {
  id: string;
  label: string;
  duree_minutes: number;
  nb_personnes: number;
  prix: number;
}

function offre(id: string, label: string, duree_minutes: number, nb_personnes: number): OffreBon {
  return { id, label, duree_minutes, nb_personnes, prix: calcMontant(duree_minutes, nb_personnes)! };
}

// Prix = grille des réservations (calcMontant) : un bon vaut exactement la session qu'il offre
export const OFFRES_BON: readonly OffreBon[] = [
  offre("30_solo", "30 min solo", 30, 1),
  offre("30_duo", "30 min duo", 30, 2),
  offre("60_solo", "1h solo", 60, 1),
  offre("60_duo", "1h duo", 60, 2),
];

export function getOffreBon(id: unknown): OffreBon | null {
  return OFFRES_BON.find((o) => o.id === id) ?? null;
}

// Sans 0/O ni 1/I : un code lu à voix haute ou recopié à la main reste sans ambiguïté.
// 32 caractères → un octet aléatoire & 31 donne une distribution uniforme.
export const BON_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_RE = /^VRC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

/** Code du type `VRC-7K2M-9QXA` (40 bits d'aléa). */
export function generateBonCode(randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const chars = Array.from(randomBytes(8), (b) => BON_CODE_ALPHABET[b & 31]).join("");
  return `VRC-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Remet en forme un code saisi à la main (minuscules, espaces, tirets oubliés). */
export function normalizeBonCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^VRC/, "");
  if (raw.length !== 8) return input.trim().toUpperCase();
  return `VRC-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function isBonCode(v: string): boolean {
  return CODE_RE.test(v);
}

/** Date d'expiration : même jour, 12 mois plus tard. */
export function bonExpiry(payeLe: Date): Date {
  const d = new Date(payeLe);
  d.setUTCMonth(d.getUTCMonth() + BON_VALIDITE_MOIS);
  return d;
}

export type BonStatut = "en_attente" | "valide" | "utilise" | "annule" | "echec";

/** État affiché : un bon valide dont la date est passée est « expire ». */
export function bonEtat(bon: { statut: BonStatut; expire_le: string | null }, now = Date.now()): BonStatut | "expire" {
  if (bon.statut === "valide" && bon.expire_le && Date.parse(bon.expire_le) < now) return "expire";
  return bon.statut;
}

export interface BonAchat {
  offre: OffreBon;
  acheteur_nom: string;
  acheteur_email: string;
  beneficiaire_nom: string;
  message: string | null;
}

/** Valide la saisie du formulaire d'achat (même règles côté navigateur et serveur). */
export function validateBonAchat(input: Record<string, unknown>): { ok: true; value: BonAchat } | { ok: false; errors: Record<string, string> } {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string).trim() : "");
  const errors: Record<string, string> = {};

  const offreBon = getOffreBon(input.offre);
  if (!offreBon) errors.offre = "Choisissez un bon cadeau.";

  const acheteur_nom = str("acheteur_nom");
  if (!acheteur_nom) errors.acheteur_nom = "Indiquez votre nom.";
  else if (acheteur_nom.length > BON_NOM_MAX) errors.acheteur_nom = `${BON_NOM_MAX} caractères maximum.`;

  const acheteur_email = str("acheteur_email").toLowerCase();
  if (!isValidEmail(acheteur_email) || isFakeEmail(acheteur_email))
    errors.acheteur_email = "Adresse email invalide : le bon vous sera envoyé à cette adresse.";

  const beneficiaire_nom = str("beneficiaire_nom");
  if (!beneficiaire_nom) errors.beneficiaire_nom = "Indiquez le prénom de la personne à qui vous offrez le bon.";
  else if (beneficiaire_nom.length > BON_NOM_MAX) errors.beneficiaire_nom = `${BON_NOM_MAX} caractères maximum.`;

  const message = str("message");
  if (message.length > BON_MESSAGE_MAX) errors.message = `${BON_MESSAGE_MAX} caractères maximum.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { offre: offreBon!, acheteur_nom, acheteur_email, beneficiaire_nom, message: message || null },
  };
}

// ── Utilisation d'un bon dans une réservation ────────────────────────────────

export type BonRefus = "inconnu" | "utilise" | "expire" | "annule" | "deja_reserve";

export const BON_REFUS_MESSAGES: Record<BonRefus, string> = {
  inconnu: "Code inconnu. Vérifiez la saisie (ex. VRC-7K2M-9QXA).",
  utilise: "Ce bon cadeau a déjà été utilisé.",
  expire: "Ce bon cadeau a expiré.",
  annule: "Ce bon cadeau n'est plus valable.",
  deja_reserve: "Ce bon cadeau est déjà utilisé pour une autre réservation.",
};

/**
 * Remise des bons sur le montant de la session. Un bon s'utilise en une fois :
 * s'il vaut plus que la session, la différence est perdue (reste = 0).
 */
export function resteAPayer(total: number | null, bons: { montant: number }[]): { deduction: number; reste: number | null } {
  const valeur = bons.reduce((s, b) => s + Number(b.montant), 0);
  if (total === null) return { deduction: valeur, reste: null };
  const deduction = Math.min(valeur, total);
  return { deduction, reste: total - deduction };
}
