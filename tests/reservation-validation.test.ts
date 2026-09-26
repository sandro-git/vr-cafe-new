import { describe, expect, it } from "vitest";
import {
  detectPhoneCountry,
  formatPhoneForStorage,
  isFakeEmail,
  isFakePhone,
  isValidEmail,
  isValidPhone,
  validateClientInfo,
} from "../src/lib/reservation-validation";

const CAFE = "0671410695";

describe("isValidEmail", () => {
  it("accepte une adresse classique, espaces autour tolérés", () => {
    expect(isValidEmail("test@vr-cafe.fr")).toBe(true);
    expect(isValidEmail("prenom.nom+resa@gmail.com")).toBe(true);
    expect(isValidEmail("  x@y.com ")).toBe(true);
  });

  it("refuse les adresses mal formées", () => {
    for (const email of ["", "a@b", "@b.fr", "a@@b.fr", "a b@c.fr", "a@b.c", "sans-arobase.fr"]) {
      expect(isValidEmail(email), email).toBe(false);
    }
  });
});

describe("isFakeEmail", () => {
  it("détecte les domaines bidons, quelle que soit la casse", () => {
    expect(isFakeEmail("a@example.com")).toBe(true);
    expect(isFakeEmail("a@exemple.fr")).toBe(true);
    expect(isFakeEmail("a@test.fr")).toBe(true);
    expect(isFakeEmail("a@mdj.fr")).toBe(true);
    expect(isFakeEmail("A@EXAMPLE.COM")).toBe(true);
  });

  it("laisse passer les vrais domaines", () => {
    expect(isFakeEmail("test@vr-cafe.fr")).toBe(false);
    expect(isFakeEmail("a@gmail.com")).toBe(false);
    expect(isFakeEmail("pas-un-email")).toBe(false);
  });
});

describe("isValidPhone", () => {
  it("France : accepte les formats national, espacé et international", () => {
    expect(isValidPhone(CAFE, "FR")).toBe(true);
    expect(isValidPhone("06 71 41 06 95", "FR")).toBe(true);
    expect(isValidPhone("+33671410695", "FR")).toBe(true);
    expect(isValidPhone("05 61 23 45 67", "FR")).toBe(true);
  });

  it("France : refuse un numéro trop court, trop long ou non numérique", () => {
    expect(isValidPhone("067141069", "FR")).toBe(false);
    expect(isValidPhone("06714106951", "FR")).toBe(false);
    expect(isValidPhone("abc", "FR")).toBe(false);
    expect(isValidPhone("", "FR")).toBe(false);
    expect(isValidPhone("   ", "FR")).toBe(false);
  });

  it("autres pays de la liste au format national", () => {
    expect(isValidPhone("612345678", "ES")).toBe(true);
    expect(isValidPhone("0475123456", "BE")).toBe(true);
    expect(isValidPhone("07911123456", "GB")).toBe(true);
    expect(isValidPhone("312345", "AD")).toBe(true);
  });

  it("un numéro avec indicatif prime sur le pays sélectionné", () => {
    expect(isValidPhone("+34612345678", "FR")).toBe(true);
  });

  it("« Autre pays » ou pays absent : indicatif + obligatoire", () => {
    expect(isValidPhone("+33 6 71 41 06 95", "OTHER")).toBe(true);
    expect(isValidPhone(CAFE, "OTHER")).toBe(false);
    expect(isValidPhone(CAFE)).toBe(false);
  });
});

describe("isFakePhone", () => {
  it("détecte les placeholders connus", () => {
    expect(isFakePhone("0612345678", "FR")).toBe(true);
    expect(isFakePhone("0612346878", "FR")).toBe(true);
    expect(isFakePhone("+33612345678", "OTHER")).toBe(true);
  });

  it("détecte les chiffres répétés après le préfixe", () => {
    expect(isFakePhone("0666666666", "FR")).toBe(true);
    expect(isFakePhone("0700000000", "FR")).toBe(true);
  });

  it("détecte les suites croissantes ou décroissantes", () => {
    expect(isFakePhone("0123456789", "FR")).toBe(true);
    expect(isFakePhone("0987654321", "FR")).toBe(true);
  });

  it("les suites sont détectées même quand le préfixe (6, 7…) casse la séquence", () => {
    expect(isFakePhone("0712345678", "FR")).toBe(true);
    expect(isFakePhone("0698765432", "FR")).toBe(true);
    expect(isFakePhone("+33 7 23 45 67 89", "OTHER")).toBe(true);
  });

  it("détecte une paire de chiffres répétée", () => {
    expect(isFakePhone("0612121212", "FR")).toBe(true);
    expect(isFakePhone("0745454545", "FR")).toBe(true);
  });

  it("ne piège pas les numéros courts (Andorre, 6 chiffres)", () => {
    expect(isFakePhone("312345", "AD")).toBe(false);
    expect(isFakePhone("321212", "AD")).toBe(false);
  });

  it("laisse passer les vrais numéros", () => {
    expect(isFakePhone(CAFE, "FR")).toBe(false);
    expect(isFakePhone("0561234567", "FR")).toBe(false);
    expect(isFakePhone("0475123456", "BE")).toBe(false);
  });

  it("un numéro illisible n'est pas considéré comme bidon (isValidPhone s'en charge)", () => {
    expect(isFakePhone("abc", "FR")).toBe(false);
  });
});

describe("formatPhoneForStorage", () => {
  it("normalise au format international", () => {
    expect(formatPhoneForStorage(CAFE, "FR")).toBe("+33 6 71 41 06 95");
    expect(formatPhoneForStorage(" 06 71 41 06 95 ", "FR")).toBe("+33 6 71 41 06 95");
    expect(formatPhoneForStorage("612345678", "ES")).toBe("+34 612 34 56 78");
    expect(formatPhoneForStorage("+33671410695", "OTHER")).toBe("+33 6 71 41 06 95");
  });

  it("retombe sur la saisie brute si le numéro est illisible", () => {
    expect(formatPhoneForStorage("  abc ", "FR")).toBe("abc");
  });
});

describe("detectPhoneCountry", () => {
  it("retrouve le pays d'un numéro stocké", () => {
    expect(detectPhoneCountry("+33 6 71 41 06 95")).toBe("FR");
    expect(detectPhoneCountry("+34 612 34 56 78")).toBe("ES");
    expect(detectPhoneCountry("+32 475 12 34 56")).toBe("BE");
  });

  it("« Autre pays » hors liste ou illisible", () => {
    expect(detectPhoneCountry("+1 202 555 0100")).toBe("OTHER");
    expect(detectPhoneCountry("n'importe quoi")).toBe("OTHER");
  });
});

describe("validateClientInfo", () => {
  it("valide un client correct", () => {
    expect(validateClientInfo("test@vr-cafe.fr", CAFE, "FR")).toBeNull();
  });

  it("email obligatoire par défaut", () => {
    expect(validateClientInfo("", CAFE, "FR")).toBe("Adresse email invalide.");
  });

  it("email facultatif avec requireEmail: false", () => {
    expect(validateClientInfo("", CAFE, "FR", { requireEmail: false })).toBeNull();
  });

  it("un email saisi reste vérifié même s'il est facultatif", () => {
    expect(validateClientInfo("pas-un-email", CAFE, "FR", { requireEmail: false })).toBe("Adresse email invalide.");
  });

  it("messages d'erreur dans l'ordre : email invalide, email bidon, téléphone invalide, téléphone bidon", () => {
    expect(validateClientInfo("a@b", "abc", "FR")).toBe("Adresse email invalide.");
    expect(validateClientInfo("a@example.com", "abc", "FR")).toBe("Merci de renseigner une vraie adresse email.");
    expect(validateClientInfo("test@vr-cafe.fr", "abc", "FR")).toBe("Numéro de téléphone invalide pour le pays sélectionné.");
    expect(validateClientInfo("test@vr-cafe.fr", "0612345678", "FR")).toBe("Merci de renseigner votre vrai numéro de téléphone.");
  });
});
