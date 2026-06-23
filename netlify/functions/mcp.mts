import type { Context, Config } from "@netlify/functions";
import { createClient as createSanityClient } from "@sanity/client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const PROTOCOL_VERSION = "2025-03-26";

function makeSupabase() {
  return createSupabaseClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function makeSanity() {
  return createSanityClient({
    projectId: "0oshw5tf",
    dataset: "production",
    useCdn: true,
    apiVersion: "2025-01-28",
  });
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "list_games",
    description:
      "List VR games available at VR Café Lyon. Optionally filter by category.",
    inputSchema: {
      type: "object",
      properties: {
        tag: {
          type: "string",
          enum: ["jeuxVR", "escapeGame", "freeroaming", "escapeFreeroaming"],
          description:
            "jeuxVR = wired VR games, escapeGame = wired escape rooms, " +
            "freeroaming = wireless VR games, escapeFreeroaming = wireless escape rooms",
        },
      },
    },
  },
  {
    name: "get_pricing",
    description: "Get VR session pricing at VR Café Lyon.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "check_availability",
    description:
      "Check available time slots for a VR session at VR Café Lyon on a given date.",
    inputSchema: {
      type: "object",
      required: ["date", "nb_personnes", "duree_minutes", "vr_type"],
      properties: {
        date: {
          type: "string",
          description: "Date to check (YYYY-MM-DD)",
        },
        nb_personnes: {
          type: "integer",
          minimum: 1,
          maximum: 6,
          description: "Number of players",
        },
        duree_minutes: {
          type: "integer",
          enum: [30, 60, 90],
          description: "Session duration in minutes",
        },
        vr_type: {
          type: "string",
          enum: ["filaire", "sans_fil"],
          description: "filaire = wired VR, sans_fil = wireless VR",
        },
      },
    },
  },
  {
    name: "create_reservation",
    description:
      "Book a VR session at VR Café Lyon. Sends a confirmation email and returns a reference.",
    inputSchema: {
      type: "object",
      required: [
        "client_nom",
        "client_email",
        "client_telephone",
        "nb_personnes",
        "duree_minutes",
        "vr_type",
        "creneau_debut",
      ],
      properties: {
        client_nom: { type: "string", description: "Client full name" },
        client_email: { type: "string", format: "email" },
        client_telephone: { type: "string" },
        nb_personnes: { type: "integer", minimum: 1, maximum: 6 },
        duree_minutes: {
          type: "integer",
          enum: [30, 60, 90],
          description: "Session duration in minutes",
        },
        vr_type: { type: "string", enum: ["filaire", "sans_fil"] },
        creneau_debut: {
          type: "string",
          format: "date-time",
          description:
            "Session start datetime (ISO 8601, e.g. 2025-05-10T14:00:00)",
        },
        notes: { type: "string" },
      },
    },
  },
];

// ── Tool handlers ────────────────────────────────────────────────────────────

async function toolListGames(args: Record<string, unknown>) {
  const sanityRaw = makeSanity() as unknown as { fetch(q: string, p?: Record<string, unknown>): Promise<Record<string, unknown>[]> };
  const tag = args.tag as string | undefined;

  const games = await sanityRaw.fetch(
    tag
      ? `*[_type == "games" && $tag in tags[]->title] | order(name asc) {name, "slug": slug.current, description, players, duration, difficulty, age}`
      : `*[_type == "games"] | order(name asc) {name, "slug": slug.current, description, players, duration, difficulty, age}`,
    tag ? { tag } : undefined
  );
  if (!games.length) return text("Aucun jeu trouvé.");

  const lines = games.map(
    (g: Record<string, unknown>) =>
      `- **${g.name}** (https://vr-cafe.fr/${g.slug}) — ${g.players} joueurs, ${g.duration} min, difficulté: ${g.difficulty}`
  );
  return text(lines.join("\n"));
}

function toolGetPricing() {
  return text(`## Tarifs VR Café Lyon

**30 minutes :** 18 €/personne

**60 minutes :**
- 1–2 personnes : 29 €/personne
- 3–4 personnes : 27 €/personne
- 5–6 personnes : 25 €/personne

Tarifs identiques pour VR filaire et sans fil.`);
}

async function toolCheckAvailability(args: Record<string, unknown>) {
  const supabase = makeSupabase();
  const date = args.date as string;
  const nb_personnes = args.nb_personnes as number;
  const duree_minutes = args.duree_minutes as number;
  const vr_type = args.vr_type as string;

  // Check closure
  const { data: fermeture } = await supabase
    .from("jours_fermeture")
    .select("date")
    .eq("date", date)
    .maybeSingle();
  if (fermeture) return text(`VR Café est fermé le ${date}.`);

  // Get config (with sensible fallbacks)
  const { data: cfg, error: cfgError } = await supabase.from("config").select("*").maybeSingle();
  if (cfgError) console.error("[MCP] config error:", cfgError);

  const heure_ouverture = (cfg?.heure_ouverture as string) ?? "10:00";
  const heure_fermeture = (cfg?.heure_fermeture as string) ?? "22:00";
  const buffer = (cfg?.buffer_minutes as number) ?? 15;

  const [openH, openM] = heure_ouverture.split(":").map(Number);
  const [closeH, closeM] = heure_fermeture.split(":").map(Number);

  // Generate 30-min slots and check availability
  const available: string[] = [];
  let cur = openH * 60 + openM;
  const limit = closeH * 60 + closeM - duree_minutes;

  while (cur <= limit) {
    const h = String(Math.floor(cur / 60)).padStart(2, "0");
    const m = String(cur % 60).padStart(2, "0");
    const debut = new Date(`${date}T${h}:${m}:00`);
    const finBlocage = new Date(debut.getTime() + (duree_minutes + buffer) * 60_000);

    const { data: boxes } = await supabase.rpc("get_boxes_disponibles", {
      p_debut: debut.toISOString(),
      p_fin_blocage: finBlocage.toISOString(),
      p_vr_type: vr_type,
    });

    const enough =
      vr_type === "sans_fil"
        ? boxes && boxes.length > 0
        : boxes && boxes.length >= nb_personnes;

    if (enough) available.push(`${h}:${m}`);
    cur += 30;
  }

  if (!available.length)
    return text(
      `Aucun créneau disponible le ${date} pour ${nb_personnes} personne(s), ${duree_minutes} min, VR ${vr_type}.`
    );

  return text(
    `Créneaux disponibles le ${date} (${duree_minutes} min, VR ${vr_type}, ${nb_personnes} personne(s)) :\n` +
      available.map((s) => `- ${s}`).join("\n")
  );
}

async function toolCreateReservation(args: Record<string, unknown>) {
  const supabase = makeSupabase();
  const creneau_debut = args.creneau_debut as string;
  const duree_minutes = args.duree_minutes as number;
  const vr_type = args.vr_type as string;
  const nb_personnes = args.nb_personnes as number;

  // Get buffer from config for fin_blocage (with fallback)
  const { data: cfg, error: cfgError } = await supabase.from("config").select("buffer_minutes").maybeSingle();
  if (cfgError) console.error("[MCP] config error:", cfgError);
  const buffer = (cfg?.buffer_minutes as number) ?? 15;

  const debut = new Date(creneau_debut);
  const fin = new Date(debut.getTime() + duree_minutes * 60_000);
  const finBlocage = new Date(debut.getTime() + (duree_minutes + buffer) * 60_000);

  // Check boxes available
  const { data: boxes } = await supabase.rpc("get_boxes_disponibles", {
    p_debut: debut.toISOString(),
    p_fin_blocage: finBlocage.toISOString(),
    p_vr_type: vr_type,
  });

  const needed = vr_type === "sans_fil" ? 1 : nb_personnes;
  if (!boxes || boxes.length < needed)
    return text(
      "Aucune box disponible pour ce créneau. Veuillez choisir un autre horaire."
    );

  const assigned = boxes.slice(0, needed);

  // Insert reservation
  const { data: resa, error } = await supabase
    .from("reservations")
    .insert({
      client_nom: args.client_nom,
      client_email: args.client_email,
      client_telephone: args.client_telephone,
      nb_personnes,
      duree_minutes,
      creneau_debut: debut.toISOString(),
      creneau_fin: fin.toISOString(),
      creneau_fin_blocage: finBlocage.toISOString(),
      statut: "confirmée",
      notes: (args.notes as string) ?? null,
    })
    .select()
    .single();

  if (error || !resa)
    return text("Erreur lors de la création de la réservation. Veuillez réessayer.");

  // Insert boxes
  await supabase
    .from("reservation_boxes")
    .insert(assigned.map((b: Record<string, unknown>) => ({ reservation_id: resa.id, box_id: b.id })));

  const ref = (resa.id as string).split("-")[0].toUpperCase();
  const boxNames = assigned.map((b: Record<string, unknown>) => b.box_nom).join(", ");

  // Send confirmation email (fire-and-forget)
  fetch("https://vr-cafe.fr/api/reservation-confirmation", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://vr-cafe.fr" },
    body: JSON.stringify({
      client_nom: args.client_nom,
      client_email: args.client_email,
      client_telephone: args.client_telephone,
      nb_personnes,
      duree_minutes,
      vr_type,
      creneau_debut: debut.toISOString(),
      creneau_fin: fin.toISOString(),
      box_names: boxNames,
      ref,
      notes: (args.notes as string) ?? null,
    }),
  }).catch(() => {});

  // Push notification admin (fire-and-forget)
  fetch("https://vr-cafe.fr/api/push-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Nouvelle réservation 🎮",
      body: `${args.client_nom} — ${nb_personnes} pers. — ${debut.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
      url: "/admin/reservations",
    }),
  }).catch(() => {});

  return text(
    `✅ Réservation confirmée !\n\n` +
      `Référence : **${ref}**\n` +
      `Date : ${debut.toLocaleString("fr-FR")}\n` +
      `Durée : ${duree_minutes} min\n` +
      `Personnes : ${nb_personnes}\n` +
      `VR : ${vr_type}\n` +
      `Box(es) : ${boxNames}\n\n` +
      `Un email de confirmation a été envoyé à ${args.client_email}.`
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function text(t: string) {
  return { content: [{ type: "text", text: t }] };
}

function rpcOk(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcErr(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function json(body: unknown, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...extra },
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-session-id",
};

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(rpcErr(null, -32700, "Parse error"), CORS);
  }

  const { id, method, params } = body;

  // JSON-RPC notification (no id) — no response
  if (id === undefined || id === null) {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    switch (method as string) {
      case "initialize":
        return json(
          rpcOk(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: "VR Café", version: "1.0.0" },
          }),
          CORS
        );

      case "tools/list":
        return json(rpcOk(id, { tools: TOOLS }), CORS);

      case "tools/call": {
        const { name, arguments: args = {} } = params as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        let result: unknown;
        switch (name) {
          case "list_games":
            result = await toolListGames(args);
            break;
          case "get_pricing":
            result = toolGetPricing();
            break;
          case "check_availability":
            result = await toolCheckAvailability(args);
            break;
          case "create_reservation":
            result = await toolCreateReservation(args);
            break;
          default:
            return json(rpcErr(id, -32602, `Unknown tool: ${name}`), CORS);
        }
        return json(rpcOk(id, result), CORS);
      }

      case "ping":
        return json(rpcOk(id, {}), CORS);

      default:
        return json(rpcErr(id, -32601, "Method not found"), CORS);
    }
  } catch (err) {
    console.error("[MCP]", err);
    return json(rpcErr(id, -32603, "Internal error"), CORS);
  }
};

export const config: Config = {
  path: "/api/mcp",
};
