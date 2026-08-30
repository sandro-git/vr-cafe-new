// API publique de la roue de récompense — tirage pondéré calculé côté
// serveur à partir des lots Sanity (jamais côté client, pour éviter qu'un
// client force le meilleur lot via les devtools). Un email ne peut gagner
// qu'une fois (index unique sur roue_tirages, cf. supabase/roue_tirages.sql).

import type { Context, Config } from "@netlify/functions";
import { createClient as createSanityClient } from "@sanity/client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = [
  "https://vr-cafe.fr",
  "https://www.vr-cafe.fr",
  "http://localhost:4321",
  "http://localhost:8888",
];

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sans 0/O/1/I ambigus
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LotRoue = { label: string; poids: number };

function makeSanity() {
  return createSanityClient({
    projectId: "0oshw5tf",
    dataset: "production",
    useCdn: false, // le tirage doit voir les lots actifs à jour, pas une réponse mise en cache CDN
    apiVersion: "2025-01-28",
  });
}

function makeSupabase() {
  return createSupabaseClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function generateCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function tirerLot(lots: LotRoue[]): number {
  const total = lots.reduce((sum, lot) => sum + lot.poids, 0);
  let seuil = Math.random() * total;
  for (let i = 0; i < lots.length; i++) {
    seuil -= lots[i].poids;
    if (seuil <= 0) return i;
  }
  return lots.length - 1;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: { email?: string; "bot-field"?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Honeypot : un bot qui remplit ce champ caché reçoit un faux succès, sans
  // indice sur la vraie raison du rejet ni écriture en base.
  if (body["bot-field"]) {
    return json({ ok: true, index: 0, label: "", code: generateCode() });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return json({ error: "invalid_email" }, 400);
  }

  const supabase = makeSupabase();

  const { data: existant } = await supabase
    .from("roue_tirages")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existant) {
    return json({ error: "already_played" }, 403);
  }

  const sanity = makeSanity();
  const lots = (await sanity.fetch<LotRoue[]>(
    `*[_type == "lotRoue" && actif == true] | order(ordre asc) { label, poids }`
  )) as unknown as LotRoue[];

  if (!lots || lots.length === 0) {
    return json({ error: "no_prizes_configured" }, 500);
  }

  const index = tirerLot(lots);
  const label = lots[index].label;
  const code = generateCode();

  const { error: insertError } = await supabase.from("roue_tirages").insert({
    email,
    lot_label: label,
    code,
  });

  if (insertError) {
    // Conflit sur l'index unique lower(email) = tentative de rejeu concurrente
    if (insertError.code === "23505") {
      return json({ error: "already_played" }, 403);
    }
    console.error("roue insert error:", insertError);
    return json({ error: "server_error" }, 500);
  }

  return json({ ok: true, index, label, code });
};

export const config: Config = {
  path: "/api/roue",
};
