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

// Le placeholder affiché dans les champs téléphone des formulaires ("06 12 34 56 78")
// et une variante à un chiffre près, déjà vues sur des réservations bidons.
const FAKE_PHONE_NUMBERS = ["0612345678", "0612346878"];

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

export function isValidPhone(v: string): boolean {
  return /^(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}$/.test(v.trim());
}

export function isFakeEmail(v: string): boolean {
  const domain = v.trim().toLowerCase().split("@")[1];
  return !!domain && FAKE_EMAIL_DOMAINS.includes(domain);
}

function normalizePhone(v: string): string {
  const digits = v.trim().replace(/[\s.-]/g, "").replace(/^(?:\+33|0033)/, "0");
  return digits;
}

export function isFakePhone(v: string): boolean {
  const digits = normalizePhone(v);
  if (FAKE_PHONE_NUMBERS.includes(digits)) return true;
  if (digits.length !== 10) return false;

  const subscriberNumber = digits.slice(2); // après le "0" et le chiffre de préfixe (06/07/...)
  if (/^(\d)\1+$/.test(subscriberNumber)) return true; // chiffres tous identiques

  const nums = digits.split("").map(Number);
  const ascending = nums.every((n, i) => i === 0 || n === (nums[i - 1] + 1) % 10);
  const descending = nums.every((n, i) => i === 0 || n === (nums[i - 1] + 9) % 10);
  if (ascending || descending) return true;

  return false;
}

export function validateClientInfo(email: string, telephone: string): string | null {
  if (!isValidEmail(email)) return "Adresse email invalide.";
  if (isFakeEmail(email)) return "Merci de renseigner une vraie adresse email.";
  if (!isValidPhone(telephone)) return "Numéro de téléphone invalide (format français attendu).";
  if (isFakePhone(telephone)) return "Merci de renseigner votre vrai numéro de téléphone.";
  return null;
}
