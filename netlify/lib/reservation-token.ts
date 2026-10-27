function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

// Pas de secret de repli : une valeur écrite dans le code permettrait à
// n'importe qui de forger des liens d'annulation.
function getSecret(): string | null {
  return getEnv("ADMIN_PASSWORD") || null;
}

/** Faux si aucun secret n'est configuré : pas de liens d'action dans ce cas. */
export function hasReservationTokenSecret(): boolean {
  return getSecret() !== null;
}

/** Génère le token public d'action (annulation/modification) pour une réservation. */
export async function generateReservationToken(reservationId: string): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD absent : impossible de signer le lien");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(reservationId));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Vérifie le token public d'action pour une réservation donnée. */
export async function verifyReservationToken(reservationId: string, token: string): Promise<boolean> {
  if (!token || !hasReservationTokenSecret()) return false;
  const expected = await generateReservationToken(reservationId);
  // Comparaison en temps constant
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
