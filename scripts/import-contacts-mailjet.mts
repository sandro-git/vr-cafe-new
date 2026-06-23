/**
 * Import one-shot des contacts Supabase → Mailjet
 * Usage : bun run scripts/import-contacts-mailjet.mts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// ── Charger le .env manuellement ─────────────────────────────────────────────
const envPath = new URL("../.env", import.meta.url).pathname;
const envVars: Record<string, string> = {};
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) envVars[match[1]] = match[2].trim();
}

const SUPABASE_URL = envVars.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.PUBLIC_SUPABASE_ANON_KEY;
const MJ_API_KEY = envVars.MAILJET_API_KEY;
const MJ_API_SECRET = envVars.MAILJET_API_SECRET;
const MJ_LIST_ID = Number(envVars.MAILJET_LIST_ID);

if (!SUPABASE_URL || !SUPABASE_KEY || !MJ_API_KEY || !MJ_API_SECRET || !MJ_LIST_ID) {
  console.error("❌ Variables d'environnement manquantes dans .env");
  process.exit(1);
}

const AUTH = Buffer.from(`${MJ_API_KEY}:${MJ_API_SECRET}`).toString("base64");

// ── Helpers Mailjet ───────────────────────────────────────────────────────────
async function mjPost(path: string, body: unknown) {
  const res = await fetch(`https://api.mailjet.com/v3/REST/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${AUTH}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function ensureContactProperties() {
  const props = [
    { Name: "last_reservation_date", DataType: "datetime", NameSpace: "static" },
    { Name: "reservation_count", DataType: "int", NameSpace: "static" },
    { Name: "vr_type", DataType: "str", NameSpace: "static" },
  ];
  for (const prop of props) {
    const res = await fetch("https://api.mailjet.com/v3/REST/contactmetadata", {
      method: "POST",
      headers: { Authorization: `Basic ${AUTH}`, "Content-Type": "application/json" },
      body: JSON.stringify(prop),
    });
    const data = await res.json() as any;
    if (res.ok) {
      console.log(`  ✅ Propriété créée : ${prop.Name}`);
    } else if (data?.ErrorMessage?.includes("already")) {
      console.log(`  ℹ️  Propriété existante : ${prop.Name}`);
    } else {
      console.log(`  ⚠️  ${prop.Name} : ${data?.ErrorMessage}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("📥 Récupération des réservations depuis Supabase...");
const { data: reservations, error } = await supabase
  .from("reservations")
  .select("client_nom, client_email, client_telephone, statut, creneau_debut")
  .not("client_email", "is", null)
  .neq("client_email", "");

if (error || !reservations) {
  console.error("❌ Erreur Supabase :", error?.message);
  process.exit(1);
}

console.log(`  → ${reservations.length} réservations récupérées`);

// Dédupliquer par email et calculer les stats
const clientMap = new Map<string, {
  nom: string;
  email: string;
  telephone: string;
  nbConfirmees: number;
  derniereResa: string | null;
  vrType: string;
}>();

for (const r of reservations) {
  const email = r.client_email.toLowerCase().trim();
  const existing = clientMap.get(email);

  const isConfirmee = r.statut === "confirmée";
  const dateResa = r.creneau_debut;

  if (!existing) {
    clientMap.set(email, {
      nom: r.client_nom ?? "",
      email,
      telephone: r.client_telephone ?? "",
      nbConfirmees: isConfirmee ? 1 : 0,
      derniereResa: isConfirmee ? dateResa : null,
      vrType: "",
    });
  } else {
    if (isConfirmee) {
      existing.nbConfirmees++;
      if (!existing.derniereResa || dateResa > existing.derniereResa) {
        existing.derniereResa = dateResa;
        // vr_type non disponible dans reservations
      }
    }
  }
}

const clients = [...clientMap.values()];
console.log(`  → ${clients.length} clients uniques trouvés`);

// ── Créer les propriétés de contact si nécessaire ────────────────────────────
console.log("\n⚙️  Vérification des propriétés de contact Mailjet...");
await ensureContactProperties();

// ── Import en masse via managemanycontacts ────────────────────────────────────
console.log(`\n📤 Import de ${clients.length} contacts dans Mailjet (liste ID: ${MJ_LIST_ID})...`);

const contacts = clients.map((c) => ({
  Email: c.email,
  Name: c.nom,
  IsExcludedFromCampaigns: false,
  Properties: {
    last_reservation_date: c.derniereResa ?? new Date().toISOString(),
    reservation_count: c.nbConfirmees,
    vr_type: c.vrType === "sans_fil" ? "VR Sans Fil" : "VR Filaire",
  },
}));

const result = await mjPost("contact/managemanycontacts", {
  ContactsLists: [{ ListID: MJ_LIST_ID, Action: "addnoforce" }],
  Contacts: contacts,
}) as any;

if (result?.Data?.[0]?.JobID) {
  const jobId = result.Data[0].JobID;
  console.log(`  ✅ Import lancé — Job ID : ${jobId}`);
  console.log(`  → Vérifiez l'avancement sur : https://app.mailjet.com/contacts/lists`);

  // Attendre et vérifier le statut
  console.log("\n⏳ Vérification du statut dans 5 secondes...");
  await new Promise((r) => setTimeout(r, 5000));

  const statusRes = await fetch(`https://api.mailjet.com/v3/REST/contact/managemanycontacts/${jobId}`, {
    headers: { Authorization: `Basic ${AUTH}` },
  });
  const status = await statusRes.json() as any;
  const job = status?.Data?.[0];

  if (job) {
    console.log(`  Statut : ${job.Status}`);
    console.log(`  Contacts traités : ${job.Count ?? "—"}`);
    if (job.Error) console.log(`  Erreur : ${job.Error}`);
  }
} else {
  console.error("❌ Réponse inattendue :", JSON.stringify(result, null, 2));
}

console.log("\n✅ Script terminé.");
