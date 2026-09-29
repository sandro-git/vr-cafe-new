// Cycle de vie d'un bon cadeau vendu en ligne :
// 1. startCheckout : bon « en_attente » en base + paiement hébergé SumUp (prix recalculé ici)
// 2. finalizeBon   : appelé par le webhook SumUp ET par la page /cadeaux/merci. Relit le
//    paiement chez SumUp (le webhook n'est pas signé : on ne croit que l'API), vérifie montant,
//    référence et marchand, puis passe le bon en « valide » par un UPDATE conditionnel
//    (WHERE statut = 'en_attente') → le bon n'est activé, envoyé et notifié qu'une fois.
import { bonEtat, bonExpiry, generateBonCode, getOffreBon, isBonCode, normalizeBonCode, type BonAchat, type BonRefus } from "../../src/lib/bons-cadeaux.ts";
import { notifyNewReservation } from "../../src/lib/notify.ts";
import { DuplicateCodeError, type Bon, type BonRepo, type NewBon } from "./bon-repo.ts";
import { sendBonAdminEmail, sendBonClientEmail, sendBonRefundAdminEmail } from "./bon-cadeau-emails.ts";
import { createHostedCheckout, getCheckout, getTransaction, refundTransaction, refundedAmount, type SumUpConfig } from "./sumup.ts";

const CODE_ATTEMPTS = 5;

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

/** Un compte SumUp sandbox ne doit jamais encaisser (faussement) sur le site en production. */
export class SandboxInProductionError extends Error {}

export async function startCheckout(
  repo: BonRepo,
  sumup: SumUpConfig,
  achat: BonAchat,
  opts: { origin: string; webhookUrl?: string; isProduction: boolean },
): Promise<{ id: string; url: string }> {
  const id = crypto.randomUUID();
  await repo.insert({
    id,
    offre: achat.offre.id,
    offre_label: achat.offre.label,
    montant: achat.offre.prix,
    acheteur_nom: achat.acheteur_nom,
    acheteur_email: achat.acheteur_email,
    beneficiaire_nom: achat.beneficiaire_nom,
    message: achat.message,
    statut: "en_attente",
  });

  const checkout = await createHostedCheckout(sumup, {
    reference: id,
    amount: achat.offre.prix,
    description: `Bon cadeau VR Café – ${achat.offre.label}`,
    redirectUrl: `${opts.origin}/cadeaux/merci?bon=${id}`,
    returnUrl: opts.webhookUrl,
  });

  const sandbox = checkout.merchant_sandbox === true;
  await repo.update(id, { sumup_checkout_id: checkout.id, sandbox });
  if (sandbox && opts.isProduction) {
    await repo.update(id, { statut: "echec" });
    throw new SandboxInProductionError("Compte SumUp sandbox configuré sur le site en production");
  }
  if (!checkout.hosted_checkout_url) throw new Error("SumUp n'a pas renvoyé de page de paiement");
  return { id, url: checkout.hosted_checkout_url };
}

/** Passe un bon au statut valide avec un code unique (seulement depuis l'un des statuts `from`). */
export async function activateBon(repo: BonRepo, id: string, patch: Partial<Bon>, from: Bon["statut"][], now = new Date()): Promise<Bon | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await repo.update(
        id,
        { ...patch, statut: "valide", code: generateBonCode(), paye_le: now.toISOString(), expire_le: bonExpiry(now).toISOString() },
        from,
      );
    } catch (err) {
      if (!(err instanceof DuplicateCodeError) || attempt >= CODE_ATTEMPTS) throw err;
    }
  }
}

/** Envoie le bon à l'acheteur, prévient l'admin (email + push). Jamais bloquant. */
export async function deliverBon(repo: BonRepo, bon: Bon, { notifyAdmin = true } = {}): Promise<{ bon: Bon; emailSent: boolean }> {
  const apiKey = getEnv("MAILJET_API_KEY");
  const apiSecret = getEnv("MAILJET_API_SECRET");
  const senderEmail = getEnv("MAILJET_SENDER_EMAIL") || "contact@vr-cafe.fr";
  let result = bon;
  let emailSent = false;

  if (apiKey && apiSecret) {
    const creds = { apiKey, apiSecret, senderEmail };
    if (bon.acheteur_email) {
      try {
        await sendBonClientEmail(bon, creds);
        emailSent = true;
        result = (await repo.update(bon.id, { email_envoye_le: new Date().toISOString() })) ?? bon;
      } catch (err) {
        console.error("Bon cadeau : email client non envoyé", bon.id, err);
      }
    }
    if (notifyAdmin) {
      try {
        await sendBonAdminEmail(bon, creds);
      } catch (err) {
        console.error("Bon cadeau : email admin non envoyé", bon.id, err);
      }
    }
  } else {
    console.error("Bon cadeau : Mailjet non configuré, aucun email envoyé", bon.id);
  }

  if (notifyAdmin) {
    try {
      await notifyNewReservation({
        title: bon.sandbox ? "🎁 Bon cadeau vendu (TEST)" : "🎁 Bon cadeau vendu",
        body: `${bon.acheteur_nom} — ${bon.offre_label} — ${bon.montant} €`,
        url: "/admin/bons",
      });
    } catch (err) {
      console.error("Bon cadeau : notification push impossible", err);
    }
  }
  return { bon: result, emailSent };
}

/**
 * Vérifie le paiement du bon chez SumUp et l'active s'il est payé.
 * Idempotent : un bon qui n'est plus « en_attente » est renvoyé tel quel.
 */
export async function finalizeBon(repo: BonRepo, sumup: SumUpConfig, bon: Bon): Promise<Bon> {
  if (bon.statut !== "en_attente" || !bon.sumup_checkout_id) return bon;

  const checkout = await getCheckout(sumup, bon.sumup_checkout_id);
  const offre = getOffreBon(bon.offre);
  const matches =
    checkout.checkout_reference === bon.id &&
    checkout.merchant_code === sumup.merchantCode &&
    checkout.currency === "EUR" &&
    Number(checkout.amount) === Number(bon.montant) &&
    offre !== null && offre.prix === Number(bon.montant);

  if (!matches) {
    console.error("Bon cadeau : paiement SumUp incohérent avec le bon", bon.id, {
      reference: checkout.checkout_reference, amount: checkout.amount, currency: checkout.currency, merchant: checkout.merchant_code,
    });
    return bon;
  }

  if (checkout.status === "PAID") {
    const activated = await activateBon(repo, bon.id, { sumup_transaction_code: checkout.transaction_code ?? null }, ["en_attente"]);
    if (!activated) return (await repo.getById(bon.id)) ?? bon; // activé entre-temps par l'autre appel
    return (await deliverBon(repo, activated)).bon;
  }
  if (checkout.status === "FAILED" || checkout.status === "EXPIRED") {
    return (await repo.update(bon.id, { statut: "echec" }, ["en_attente"])) ?? bon;
  }
  return bon; // PENDING : le client n'a pas (encore) payé
}

/** Bon vendu au comptoir (payé au TPE) : saisi depuis /admin/bons, valide immédiatement. */
export async function createComptoirBon(repo: BonRepo, achat: Omit<BonAchat, "acheteur_email"> & { acheteur_email: string | null }): Promise<Bon> {
  const now = new Date();
  const base: NewBon = {
    id: crypto.randomUUID(),
    offre: achat.offre.id,
    offre_label: achat.offre.label,
    montant: achat.offre.prix,
    acheteur_nom: achat.acheteur_nom,
    acheteur_email: achat.acheteur_email,
    beneficiaire_nom: achat.beneficiaire_nom,
    message: achat.message,
    statut: "valide",
    mode_paiement: "comptoir",
    paye_le: now.toISOString(),
    expire_le: bonExpiry(now).toISOString(),
  };
  for (let attempt = 1; ; attempt++) {
    try {
      const bon = await repo.insert({ ...base, code: generateBonCode() });
      return (await deliverBon(repo, bon, { notifyAdmin: false })).bon;
    } catch (err) {
      if (!(err instanceof DuplicateCodeError) || attempt >= CODE_ATTEMPTS) throw err;
    }
  }
}

// ── Utilisation d'un bon dans une réservation (formulaire /reservation) ──────

/** Le rattachement n'est accepté que juste après la création de la réservation par le formulaire. */
export const ATTACH_WINDOW_MINUTES = 10;

export type BonCheck = { ok: true; bon: Bon; from: string | null } | { ok: false; raison: BonRefus };

/**
 * Le bon `rawCode` peut-il payer une réservation ?
 * `remplaceId` : réservation en cours de modification (lien vérifié par l'appelant), dont
 * les bons peuvent être repris par la nouvelle réservation.
 */
export async function checkBonUtilisable(
  repo: BonRepo,
  rawCode: unknown,
  { remplaceId = null as string | null, reservationId = null as string | null, now = Date.now() } = {},
): Promise<BonCheck> {
  const code = typeof rawCode === "string" ? normalizeBonCode(rawCode) : "";
  if (!isBonCode(code)) return { ok: false, raison: "inconnu" };
  const bon = await repo.getByCode(code);
  if (!bon || bon.statut === "en_attente" || bon.statut === "echec") return { ok: false, raison: "inconnu" };
  const etat = bonEtat(bon, now);
  if (etat === "utilise" || etat === "annule" || etat === "expire") return { ok: false, raison: etat };

  if (bon.reservation_id) {
    // Déjà rattaché à cette réservation (double envoi) ou à celle qu'elle remplace
    if (bon.reservation_id === reservationId || (remplaceId && bon.reservation_id === remplaceId)) return { ok: true, bon, from: bon.reservation_id };
    const resa = await repo.getReservation(bon.reservation_id);
    if (resa && resa.statut !== "annulée") return { ok: false, raison: "deja_reserve" };
  }
  return { ok: true, bon, from: bon.reservation_id };
}

/** Infos d'un bon utilisable, montrées dans le formulaire (jamais les noms ni l'email). */
export function bonPublic(bon: Bon) {
  const offre = getOffreBon(bon.offre);
  return {
    code: bon.code,
    offre_label: bon.offre_label,
    montant: Number(bon.montant),
    duree_minutes: offre?.duree_minutes ?? null,
    nb_personnes: offre?.nb_personnes ?? null,
    expire_le: bon.expire_le,
  };
}

/** Rattache le bon à une réservation standard qui vient d'être créée par le formulaire. */
export async function attachBonToReservation(
  repo: BonRepo,
  rawCode: unknown,
  reservationId: string,
  { remplaceId = null as string | null, now = Date.now() } = {},
): Promise<{ ok: true; bon: Bon } | { ok: false; raison: BonRefus | "reservation" }> {
  const resa = await repo.getReservation(reservationId);
  const recente = resa && now - Date.parse(resa.created_at) < ATTACH_WINDOW_MINUTES * 60_000;
  if (!resa || !recente || resa.statut !== "confirmée" || (resa.type_reservation ?? "standard") !== "standard") {
    return { ok: false, raison: "reservation" };
  }
  const check = await checkBonUtilisable(repo, rawCode, { remplaceId, reservationId, now });
  if (!check.ok) return check;
  if (check.bon.reservation_id === reservationId) return { ok: true, bon: check.bon }; // déjà fait (double envoi)
  const bon = await repo.attachReservation(check.bon.id, reservationId, check.from);
  return bon ? { ok: true, bon } : { ok: false, raison: "deja_reserve" };
}

// ── Remboursements ──────────────────────────────────────────────────────────

/** Vérification des remboursements : bons payés depuis moins de 13 mois (validité 12 mois). */
export const REFUND_LOOKBACK_DAYS = 400;

export type RefundResult =
  | { ok: true; bon: Bon; dejaRembourse: boolean }
  | { ok: false; error: string; status: number };

async function notifyRefund(bon: Bon, rembourse: number, total: boolean) {
  const apiKey = getEnv("MAILJET_API_KEY");
  const apiSecret = getEnv("MAILJET_API_SECRET");
  const senderEmail = getEnv("MAILJET_SENDER_EMAIL") || "contact@vr-cafe.fr";
  if (apiKey && apiSecret) {
    try {
      await sendBonRefundAdminEmail(bon, rembourse, total, { apiKey, apiSecret, senderEmail });
    } catch (err) {
      console.error("Bon cadeau : email de remboursement non envoyé", bon.id, err);
    }
  }
  try {
    await notifyNewReservation({
      title: total ? "↩️ Bon cadeau remboursé et annulé" : "⚠️ Bon cadeau remboursé en partie",
      body: `${bon.code} — ${bon.acheteur_nom} — ${rembourse} € sur ${bon.montant} €`,
      url: `/admin/bons?q=${encodeURIComponent(bon.code ?? "")}`,
    });
  } catch (err) {
    console.error("Bon cadeau : notification de remboursement impossible", err);
  }
}

/**
 * Bouton « Rembourser et annuler » de /admin/bons : rembourse le paiement SumUp en totalité
 * (sauf s'il l'est déjà) puis annule le bon. Bons payés en ligne et encore valides uniquement.
 */
export async function refundBon(repo: BonRepo, sumup: SumUpConfig, id: string): Promise<RefundResult> {
  const bon = await repo.getById(id);
  if (!bon) return { ok: false, error: "Bon introuvable", status: 404 };
  if (bon.mode_paiement !== "en_ligne" || !bon.sumup_transaction_code)
    return { ok: false, error: "Ce bon n'a pas été payé en ligne : remboursez-le au TPE puis annulez-le.", status: 409 };
  if (bon.statut !== "valide") return { ok: false, error: "Seul un bon valide peut être remboursé.", status: 409 };

  const txn = await getTransaction(sumup, bon.sumup_transaction_code);
  const deja = refundedAmount(txn);
  if (deja < Number(bon.montant)) {
    // Sans montant = remboursement total. SumUp refuse un montant explicite sous un minimum
    // (constaté : `min_refundable_amount: 20` pour 18 €) : on ne précise le montant que pour
    // solder un bon déjà remboursé en partie.
    try {
      await refundTransaction(sumup, txn.id, deja > 0 ? Number(bon.montant) - deja : undefined);
    } catch (err) {
      console.error("Bon cadeau : remboursement SumUp refusé", bon.id, err);
      return { ok: false, error: "SumUp a refusé le remboursement. Remboursez depuis le tableau de bord SumUp : le bon sera annulé automatiquement dans l'heure.", status: 502 };
    }
  }

  const annule = await repo.update(bon.id, { statut: "annule", montant_rembourse: Number(bon.montant) }, ["valide"]);
  return { ok: true, bon: annule ?? { ...bon, statut: "annule", montant_rembourse: Number(bon.montant) }, dejaRembourse: deja >= Number(bon.montant) };
}

/**
 * Fonction planifiée (toutes les heures) : SumUp n'envoie aucun webhook quand on rembourse depuis
 * son tableau de bord. Pour chaque bon en ligne encore valide, on relit la transaction :
 * remboursement total → bon annulé ; partiel → bon gardé. L'admin est prévenu une seule fois par
 * nouveau montant remboursé (colonne montant_rembourse).
 */
export async function syncRefunds(repo: BonRepo, sumup: SumUpConfig, now = Date.now()) {
  const since = new Date(now - REFUND_LOOKBACK_DAYS * 86400_000).toISOString();
  const bons = await repo.listRefundCandidates(since);
  const result = { verifies: 0, annules: [] as string[], partiels: [] as string[], erreurs: 0 };

  for (const bon of bons) {
    try {
      const txn = await getTransaction(sumup, bon.sumup_transaction_code!);
      result.verifies++;
      const rembourse = Math.min(refundedAmount(txn), Number(bon.montant));
      if (rembourse <= Number(bon.montant_rembourse ?? 0)) continue; // rien de nouveau

      const total = rembourse >= Number(bon.montant);
      const updated = await repo.update(
        bon.id,
        total ? { statut: "annule", montant_rembourse: rembourse } : { montant_rembourse: rembourse },
        ["valide"],
      );
      if (!updated) continue; // utilisé ou annulé entre-temps
      (total ? result.annules : result.partiels).push(bon.code ?? bon.id);
      await notifyRefund(updated, rembourse, total);
    } catch (err) {
      result.erreurs++;
      console.error("Bon cadeau : vérification du remboursement impossible", bon.id, err);
    }
  }
  return result;
}
