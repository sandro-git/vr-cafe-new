// Client minimal de l'API SumUp (paiements en ligne, Hosted Checkout).
// Doc : https://developer.sumup.com/online-payments/checkouts/hosted-checkout
// La clé API (SUMUP_API_KEY) ne quitte jamais le serveur.

const API_ROOT = "https://api.sumup.com";
const TIMEOUT_MS = 10_000;

export interface SumUpConfig {
  apiKey: string;
  merchantCode: string;
}

export interface SumUpCheckout {
  id: string;
  checkout_reference: string;
  amount: number;
  currency: string;
  merchant_code: string;
  status: "PENDING" | "PAID" | "FAILED" | "EXPIRED" | string;
  hosted_checkout_url?: string;
  merchant_sandbox?: boolean;
  transaction_code?: string;
}

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

/** Configuration SumUp, ou null si la vente en ligne n'est pas configurée. */
export function readSumUpConfig(): SumUpConfig | null {
  const apiKey = getEnv("SUMUP_API_KEY");
  const merchantCode = getEnv("SUMUP_MERCHANT_CODE");
  return apiKey && merchantCode ? { apiKey, merchantCode } : null;
}

export interface SumUpTransaction {
  id: string;
  transaction_code: string;
  amount: number;
  status: string;
  refunded_amount?: number | null;
  /** Deux listes renvoyées par SumUp pour les mêmes événements : `type` dans l'une, `event_type` dans l'autre */
  events?: { type?: string | null; status?: string; amount?: number }[];
  transaction_events?: { event_type?: string | null; status?: string; amount?: number }[];
}

async function call<T = SumUpCheckout>(cfg: SumUpConfig, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // Le corps d'erreur SumUp ne contient pas la clé : on peut le journaliser
    throw new Error(`SumUp ${init.method ?? "GET"} ${path} → ${res.status} ${await res.text().catch(() => "")}`);
  }
  // Un remboursement répond 201/204 avec un corps vide
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** Crée un paiement hébergé par SumUp ; le client est ensuite redirigé vers `hosted_checkout_url`. */
export function createHostedCheckout(
  cfg: SumUpConfig,
  args: { reference: string; amount: number; description: string; redirectUrl: string; returnUrl?: string },
): Promise<SumUpCheckout> {
  return call(cfg, "/v0.1/checkouts", {
    method: "POST",
    body: JSON.stringify({
      checkout_reference: args.reference,
      amount: args.amount,
      currency: "EUR",
      merchant_code: cfg.merchantCode,
      description: args.description,
      hosted_checkout: { enabled: true },
      redirect_url: args.redirectUrl,
      ...(args.returnUrl ? { return_url: args.returnUrl } : {}),
    }),
  });
}

export function getCheckout(cfg: SumUpConfig, id: string): Promise<SumUpCheckout> {
  return call(cfg, `/v0.1/checkouts/${encodeURIComponent(id)}`);
}

/** Transaction SumUp (statut, événements de remboursement) à partir de son code (ex. TAAA6NDTCGC). */
export function getTransaction(cfg: SumUpConfig, transactionCode: string): Promise<SumUpTransaction> {
  return call<SumUpTransaction>(
    cfg,
    `/v2.1/merchants/${encodeURIComponent(cfg.merchantCode)}/transactions?transaction_code=${encodeURIComponent(transactionCode)}`,
  );
}

/** Rembourse une transaction (en totalité si `amount` est omis). Irréversible. */
export async function refundTransaction(cfg: SumUpConfig, transactionId: string, amount?: number): Promise<void> {
  await call<unknown>(cfg, `/v1.0/merchants/${encodeURIComponent(cfg.merchantCode)}/payments/${encodeURIComponent(transactionId)}/refunds`, {
    method: "POST",
    body: JSON.stringify(amount === undefined ? {} : { amount }),
  });
}

/**
 * Montant déjà remboursé d'une transaction. SumUp ne met pas toujours `refunded_amount` ni
 * `status` à jour (constaté en sandbox : SUCCESSFUL après remboursement) : on additionne les
 * événements REFUND au statut REFUNDED. `events` et `transaction_events` décrivent les mêmes
 * événements : on garde le plus grand total, sans les cumuler.
 */
export function refundedAmount(txn: SumUpTransaction): number {
  const total = (list: { status?: string; amount?: number }[]) =>
    list.filter((e) => e.status === "REFUNDED").reduce((s, e) => s + Number(e.amount ?? 0), 0);
  return Math.max(
    total((txn.events ?? []).filter((e) => e.type === "REFUND")),
    total((txn.transaction_events ?? []).filter((e) => e.event_type === "REFUND")),
    Number(txn.refunded_amount ?? 0),
  );
}
