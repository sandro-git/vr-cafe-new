// Identifiant d'une nouvelle réservation, généré côté navigateur.
// La clé anon peut insérer dans `reservations` mais pas relire (données
// personnelles) : l'insert se fait sans `.select()` (pas de RETURNING), donc
// l'id doit être connu avant, pour `reservation_boxes`, l'email et le push.
// `crypto.getRandomValues` plutôt que `crypto.randomUUID` : ce dernier n'existe
// qu'en contexte sécurisé (HTTPS/localhost), pas sur l'accès LAN http://192.168…
export function newReservationId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
