// Lecture admin via /api/admin/db (session admin + service role côté serveur).
// Les réservations et les clients ne sont plus lisibles avec la clé anon.
// Renvoie { data, error } comme supabase-js pour garder le code des pages simple.

/**
 * @param {string} action
 * @param {Record<string, unknown>} [params]
 * @returns {Promise<{ data: any, error: { message: string } | null }>}
 */
export async function adminRead(action, params = {}) {
  try {
    const res = await fetch('/api/admin/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: { message: body.error ?? `Erreur serveur (${res.status})` } };
    return { data: body.data, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : 'Erreur réseau' } };
  }
}

/** Autocomplete client des formulaires admin, dédoublonné par email (ou nom). */
export async function fetchClientSuggestions(field, value) {
  if (value.length < 2) return [];
  const { data } = await adminRead('client_suggestions', { field, value });
  if (!data) return [];
  const seen = new Set();
  return data.filter(r => {
    const key = r.client_email || r.client_nom;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
