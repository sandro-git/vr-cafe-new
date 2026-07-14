import { isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export type PhoneCountryCode = CountryCode | "OTHER";

export interface CountryOption {
  code: PhoneCountryCode;
  name: string;
  dial: string;
  flag: string;
  placeholder: string;
}

// Liste courte ciblée (clientèle frontalière/touristique du VR Café), pas les ~240 pays du monde.
export const COUNTRIES: CountryOption[] = [
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷", placeholder: "06 12 34 56 78" },
  { code: "ES", name: "Espagne", dial: "+34", flag: "🇪🇸", placeholder: "612 34 56 78" },
  { code: "AD", name: "Andorre", dial: "+376", flag: "🇦🇩", placeholder: "312 345" },
  { code: "BE", name: "Belgique", dial: "+32", flag: "🇧🇪", placeholder: "0475 12 34 56" },
  { code: "DE", name: "Allemagne", dial: "+49", flag: "🇩🇪", placeholder: "0151 23456789" },
  { code: "GB", name: "Royaume-Uni", dial: "+44", flag: "🇬🇧", placeholder: "07911 123456" },
  { code: "IT", name: "Italie", dial: "+39", flag: "🇮🇹", placeholder: "312 345 6789" },
  { code: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹", placeholder: "912 345 678" },
  { code: "CH", name: "Suisse", dial: "+41", flag: "🇨🇭", placeholder: "078 123 45 67" },
  { code: "NL", name: "Pays-Bas", dial: "+31", flag: "🇳🇱", placeholder: "06 12345678" },
  { code: "LU", name: "Luxembourg", dial: "+352", flag: "🇱🇺", placeholder: "628 123 456" },
  { code: "OTHER", name: "Autre pays", dial: "", flag: "🌍", placeholder: "+999 numéro complet" },
];

const FAKE_EMAIL_DOMAINS = [
  "exemple.com",
  "exemple.fr",
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test.fr",
  "mdj.fr",
];

// Placeholders bidons déjà vus sur des réservations (formes E.164, indépendantes du pays choisi).
const FAKE_PHONE_E164 = ["+33612345678", "+33612346878"];

function parsePhone(v: string, country?: PhoneCountryCode) {
  const value = v.trim();
  if (!country || country === "OTHER") return parsePhoneNumberFromString(value);
  return parsePhoneNumberFromString(value, country);
}

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

export function isFakeEmail(v: string): boolean {
  const domain = v.trim().toLowerCase().split("@")[1];
  return !!domain && FAKE_EMAIL_DOMAINS.includes(domain);
}

export function isValidPhone(v: string, country?: PhoneCountryCode): boolean {
  const value = v.trim();
  if (!value) return false;
  // "Autre pays" : on exige un numéro international complet (avec indicatif).
  if ((!country || country === "OTHER") && !value.startsWith("+")) return false;
  if (!country || country === "OTHER") return isValidPhoneNumber(value);
  return isValidPhoneNumber(value, country);
}

// Numéro normalisé à stocker en base (ex: "+33 6 12 34 56 78"). Retombe sur la saisie
// brute si le parsing échoue (ne devrait pas arriver après un isValidPhone() réussi).
export function formatPhoneForStorage(v: string, country?: PhoneCountryCode): string {
  const parsed = parsePhone(v, country);
  return parsed ? parsed.formatInternational() : v.trim();
}

// Déduit le pays d'un numéro déjà stocké (format international) pour préremplir le
// sélecteur de pays en édition. "OTHER" si le numéro ne correspond à aucun pays de la liste.
export function detectPhoneCountry(v: string): PhoneCountryCode {
  const parsed = parsePhoneNumberFromString(v.trim());
  const country = parsed?.country;
  return country && COUNTRIES.some((c) => c.code === country) ? country : "OTHER";
}

export function isFakePhone(v: string, country?: PhoneCountryCode): boolean {
  const parsed = parsePhone(v, country);
  if (!parsed) return false;

  if (FAKE_PHONE_E164.includes(parsed.number)) return true;

  // Numéro national sans le chiffre de préfixe (indicateur de type de ligne, ex: le "6" de 06 en France) :
  // une suite de chiffres tous identiques à cet endroit est un signe fort de valeur bidon.
  const national = parsed.nationalNumber;
  if (national.length < 5) return false;
  const rest = national.slice(1);
  if (/^(\d)\1+$/.test(rest)) return true;

  const nums = national.split("").map(Number);
  const ascending = nums.every((n, i) => i === 0 || n === (nums[i - 1] + 1) % 10);
  const descending = nums.every((n, i) => i === 0 || n === (nums[i - 1] + 9) % 10);
  if (ascending || descending) return true;

  return false;
}

export function validateClientInfo(
  email: string,
  telephone: string,
  country?: PhoneCountryCode,
  options?: { requireEmail?: boolean }
): string | null {
  const requireEmail = options?.requireEmail ?? true;
  if (email) {
    if (!isValidEmail(email)) return "Adresse email invalide.";
    if (isFakeEmail(email)) return "Merci de renseigner une vraie adresse email.";
  } else if (requireEmail) {
    return "Adresse email invalide.";
  }
  if (!isValidPhone(telephone, country)) return "Numéro de téléphone invalide pour le pays sélectionné.";
  if (isFakePhone(telephone, country)) return "Merci de renseigner votre vrai numéro de téléphone.";
  return null;
}
