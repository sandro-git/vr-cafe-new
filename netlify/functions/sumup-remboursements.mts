import type { Config } from "@netlify/functions";
import { getBonRepo } from "../lib/bon-repo.ts";
import { syncRefunds } from "../lib/bon-cadeau.ts";
import { readSumUpConfig } from "../lib/sumup.ts";

// Fonction planifiée : SumUp n'envoie pas de webhook quand un paiement est remboursé depuis son
// tableau de bord. Toutes les heures, on relit les transactions des bons en ligne encore valides
// (cf. syncRefunds) : remboursement total → bon annulé ; l'admin est prévenu (email + push).
export default async () => {
  const sumup = readSumUpConfig();
  if (!sumup) {
    console.error("sumup-remboursements : SumUp non configuré");
    return;
  }
  const result = await syncRefunds(getBonRepo(), sumup);
  console.log("sumup-remboursements", JSON.stringify(result));
};

export const config: Config = {
  schedule: "@hourly",
};
