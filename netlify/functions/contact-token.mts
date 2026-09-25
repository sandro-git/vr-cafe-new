import type { Config } from "@netlify/functions";

// Jeton CSRF du formulaire de contact : HMAC-SHA256 de l'horodatage d'émission,
// vérifié par /api/contact (âge min 3s anti-bot, max 1h). Servi à part pour que
// /contact reste une page statique (pas de démarrage à froid de fonction).
export default async () => {
  const secret = Netlify.env.get("ADMIN_PASSWORD") || process.env.ADMIN_PASSWORD || "vrcafe-csrf-fallback";
  const ts = String(Date.now());
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(ts));
  const csrf = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return new Response(JSON.stringify({ csrf, ts }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};

export const config: Config = {
  path: "/api/contact-token",
};
