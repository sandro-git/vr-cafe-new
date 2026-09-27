// Session admin : le cookie `admin_session` contient un jeton signé, jamais le mot de passe.
// Format : `v1.<émis_le>.<expire_le>.<signature>` (horodatages en secondes, signature
// HMAC-SHA256 en base64url). Partagé par le middleware Astro, /admin/login et les
// fonctions Netlify admin.
//
// Clé de signature = HMAC(ADMIN_SESSION_SECRET, sinon ADMIN_PASSWORD ; libellé + ADMIN_PASSWORD) :
// changer l'une ou l'autre variable déconnecte toutes les sessions.

export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours, en secondes

const VERSION = "v1";
const KEY_LABEL = "vrcafe-admin-session-v1:";
const CLOCK_SKEW = 60; // secondes tolérées pour un jeton « émis dans le futur »

export interface AdminEnv {
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
}

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

/** Variables lues à l'exécution (Netlify, puis process.env). Côté Astro, passer `import.meta.env` en plus. */
export function readAdminEnv(): AdminEnv {
  return { ADMIN_PASSWORD: getEnv("ADMIN_PASSWORD"), ADMIN_SESSION_SECRET: getEnv("ADMIN_SESSION_SECRET") };
}

const enc = new TextEncoder();

async function hmac(key: BufferSource, data: string): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

async function signingKey(env: AdminEnv): Promise<CryptoKey | null> {
  if (!env.ADMIN_PASSWORD) return null;
  const root = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD;
  const raw = await hmac(enc.encode(root), KEY_LABEL + env.ADMIN_PASSWORD);
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Crée un jeton de session valable ADMIN_SESSION_MAX_AGE ; null si ADMIN_PASSWORD est absent. */
export async function createAdminSession(env: AdminEnv = readAdminEnv(), now = Date.now()): Promise<string | null> {
  const key = await signingKey(env);
  if (!key) return null;
  const iat = Math.floor(now / 1000);
  const payload = `${VERSION}.${iat}.${iat + ADMIN_SESSION_MAX_AGE}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return `${payload}.${toBase64Url(sig)}`;
}

/** Vérifie signature (en temps constant via crypto.subtle.verify) et validité du jeton. */
export async function verifyAdminSession(
  token: string | null | undefined,
  env: AdminEnv = readAdminEnv(),
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return false;
  const [, iatStr, expStr, sigStr] = parts;
  if (!/^\d{1,12}$/.test(iatStr) || !/^\d{1,12}$/.test(expStr)) return false;
  const iat = Number(iatStr);
  const exp = Number(expStr);
  const nowSec = Math.floor(now / 1000);
  if (exp - iat !== ADMIN_SESSION_MAX_AGE || iat > nowSec + CLOCK_SKEW || nowSec >= exp) return false;

  const sig = fromBase64Url(sigStr);
  const key = await signingKey(env);
  if (!sig || !key) return false;
  return crypto.subtle.verify("HMAC", key, sig, enc.encode(`${VERSION}.${iatStr}.${expStr}`));
}

/** Lit le cookie `admin_session` d'une requête (fonctions Netlify) et le vérifie. */
export async function isAdminRequest(req: Request, env: AdminEnv = readAdminEnv()): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  if (!match) return false;
  let value: string;
  try { value = decodeURIComponent(match[1]); } catch { return false; }
  return verifyAdminSession(value, env);
}

/** Compare le mot de passe saisi à ADMIN_PASSWORD en temps constant (condensats de même longueur). */
export async function checkAdminPassword(submitted: string, env: AdminEnv = readAdminEnv()): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false;
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const [a, b] = await Promise.all([hmac(nonce, submitted), hmac(nonce, env.ADMIN_PASSWORD)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
