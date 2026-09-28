import { describe, expect, it } from "vitest";
import { bonAdminEmail, bonClientEmail } from "../netlify/lib/bon-cadeau-emails";
import type { Bon } from "../netlify/lib/bon-repo";

const bon = (over: Partial<Bon> = {}): Bon => ({
  id: "b1",
  code: "VRC-7K2M-9QXA",
  offre: "60_duo",
  offre_label: "1h duo",
  montant: 58,
  acheteur_nom: "Marie <script>",
  acheteur_email: "marie@gmail.com",
  beneficiaire_nom: "Léa <img src=x onerror=alert(1)>",
  message: "Joyeux <b>anniv</b> !",
  statut: "valide",
  mode_paiement: "en_ligne",
  sandbox: false,
  sumup_checkout_id: "chk",
  sumup_transaction_code: "TX1",
  paye_le: "2026-09-28T18:30:00Z",
  expire_le: "2027-09-28T18:30:00Z",
  utilise_le: null,
  email_envoye_le: null,
  created_at: "2026-09-28T18:29:00Z",
  ...over,
});

describe("email du bon (client)", () => {
  it("contient le code, l'offre et la date d'expiration (heure de Paris)", () => {
    const { subject, html } = bonClientEmail(bon());
    expect(subject).toContain("VRC-7K2M-9QXA");
    expect(html).toContain("VRC-7K2M-9QXA");
    expect(html).toContain("1h duo");
    expect(html).toContain("28 septembre 2027");
  });

  it("échappe les saisies publiques (noms, message)", () => {
    const { html } = bonClientEmail(bon());
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>anniv");
    expect(html).toContain("Joyeux &lt;b&gt;anniv&lt;/b&gt; !");
  });

  it("sans message : pas de bloc message", () => {
    expect(bonClientEmail(bon({ message: null })).html).not.toContain("font-style: italic");
  });

  it("pas de flexbox (Gmail ne le rend pas)", () => {
    expect(bonClientEmail(bon()).html).not.toMatch(/display:\s*flex/);
    expect(bonAdminEmail(bon()).html).not.toMatch(/display:\s*flex/);
  });
});

describe("email admin", () => {
  it("sujet : offre, prix, acheteur ; mention TEST pour un paiement sandbox", () => {
    expect(bonAdminEmail(bon()).subject).toBe("[Bon cadeau] 1h duo · 58 € · Marie <script>");
    expect(bonAdminEmail(bon()).html).not.toContain("TEST");
    expect(bonAdminEmail(bon({ sandbox: true })).html).toContain("TEST SumUp sandbox");
    expect(bonAdminEmail(bon()).html).not.toContain("<script>");
  });

  it("indique le mode de paiement", () => {
    expect(bonAdminEmail(bon()).html).toContain("En ligne (SumUp TX1)");
    expect(bonAdminEmail(bon({ mode_paiement: "comptoir" })).html).toContain("Au comptoir");
  });
});
