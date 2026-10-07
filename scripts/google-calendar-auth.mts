// Autorise la synchro des réservations à écrire dans l'agenda Google « Réservation »
// et enregistre le refresh_token sur Netlify (GOOGLE_CALENDAR_REFRESH_TOKEN, secrète,
// production). Le jeton n'est jamais affiché.
//
// Lancer depuis vr-cafe-new : bun scripts/google-calendar-auth.mts
// Prérequis (console Google Cloud, projet du client OAuth GOOGLE_CLIENT_ID) :
//  - API « Google Calendar API » activée ;
//  - client de type « Application de bureau », ou client « Web » avec l'URI de
//    redirection http://localhost:8765/callback autorisée.

import { createServer } from "node:http";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { CALENDAR_SCOPES } from "../netlify/lib/google-calendar.ts";

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

async function value(name: string, secret = false): Promise<string> {
  if (process.env[name]) return process.env[name]!;
  try {
    const v = execFileSync("netlify", ["env:get", name, "--context", "production"], { encoding: "utf8" }).trim();
    if (v && !v.includes("No value")) return v;
  } catch { /* variable secrète ou CLI indisponible */ }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (secret) process.stdout.write("(la saisie s'affiche) ");
  const v = (await rl.question(`${name} : `)).trim();
  rl.close();
  return v;
}

const clientId = await value("GOOGLE_CLIENT_ID");
const clientSecret = await value("GOOGLE_CLIENT_SECRET", true);
if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants, rien n'a été modifié.");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: CALENDAR_SCOPES.join(" "),
  access_type: "offline",
  prompt: "consent",
  state,
}).toString();

const code = await new Promise<string>((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", REDIRECT_URI);
    if (url.pathname !== "/callback") return void res.writeHead(404).end();
    const c = url.searchParams.get("code");
    const ok = c && url.searchParams.get("state") === state;
    res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(ok ? "<p>Autorisation reçue, vous pouvez fermer cet onglet.</p>" : "<p>Autorisation refusée.</p>");
    server.close();
    ok ? resolve(c) : reject(new Error(url.searchParams.get("error") ?? "état OAuth invalide"));
  });
  server.listen(PORT, () => {
    console.log("\nConnectez-vous avec le compte Google qui possède l'agenda « Réservation ».");
    console.log("Si le navigateur ne s'ouvre pas, ouvrez cette adresse :\n" + authUrl + "\n");
    spawnSync("open", [authUrl.toString()]);
  });
});

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  }),
});
const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; error_description?: string };
if (!tokenRes.ok || !tokens.refresh_token) {
  console.error(`Échec de l'échange du code : ${tokens.error_description ?? tokenRes.status}`);
  process.exit(1);
}

// Vérifie que l'agenda existe avant d'enregistrer quoi que ce soit
const list = (await (
  await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
).json()) as { items?: { summary?: string }[]; error?: { message: string } };
if (list.error) {
  console.error(`Lecture des agendas impossible : ${list.error.message}`);
  process.exit(1);
}
const names = (list.items ?? []).map((c) => c.summary ?? "");
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
if (!names.some((n) => norm(n) === "reservation")) {
  console.error(`Aucun agenda « Réservation » modifiable sur ce compte. Agendas trouvés : ${names.join(", ")}`);
  process.exit(1);
}

const set = spawnSync(
  "netlify",
  ["env:set", "GOOGLE_CALENDAR_REFRESH_TOKEN", tokens.refresh_token, "--secret", "--context", "production", "--force"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
if (set.status !== 0) {
  console.error("Échec de netlify env:set, rien n'a été enregistré.");
  process.exit(1);
}
console.log("OK : agenda « Réservation » trouvé, GOOGLE_CALENDAR_REFRESH_TOKEN enregistré (secret, production).");
console.log("Redéployer le site pour qu'il soit pris en compte.");
