// Client minimal de l'API SumUp (paiements en ligne, Hosted Checkout).
// Doc : https://developer.sumup.com/online-payments/checkouts/hosted-checkout
// La clé API (SUMUP_API_KEY) ne quitte jamais le serveur.

const API = "https://api.sumup.com/v0.1";
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

async function call(cfg: SumUpConfig, path: string, init: RequestInit = {}): Promise<SumUpCheckout> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // Le corps d'erreur SumUp ne contient pas la clé : on peut le journaliser
    throw new Error(`SumUp ${init.method ?? "GET"} ${path} → ${res.status} ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

/** Crée un paiement hébergé par SumUp ; le client est ensuite redirigé vers `hosted_checkout_url`. */
export function createHostedCheckout(
  cfg: SumUpConfig,
  args: { reference: string; amount: number; description: string; redirectUrl: string; returnUrl?: string },
): Promise<SumUpCheckout> {
  return call(cfg, "/checkouts", {
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
  return call(cfg, `/checkouts/${encodeURIComponent(id)}`);
}
