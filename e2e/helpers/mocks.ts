import type { Page, Request, Route } from "@playwright/test";
import { E2E_SUPABASE_URL } from "../../playwright.config";

// Faux Supabase (API REST PostgREST) servi directement dans le navigateur.
// Toute requête non prévue échoue (500) et est listée dans `unhandled`,
// pour qu'un test ne passe jamais « par hasard ».

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-expose-headers": "content-range",
};

export type Box = { box_id: number; box_nom: string };

export type FakeSupabaseOptions = {
  config?: Record<string, unknown>[];
  durees?: { id: number; label: string; duree_minutes: number }[];
  joursFermeture?: { date: string }[];
  periodesVacances?: { date_debut: string; date_fin: string }[];
  boxes?: Box[];
  avis?: Record<string, unknown>[];
  /** Délai (ms) avant chaque réponse, pour simuler un réseau lent */
  delayMs?: number;
};

export class FakeSupabase {
  inserts: { table: string; body: any }[] = [];
  rpcCalls: { fn: string; body: any }[] = [];
  unhandled: string[] = [];

  constructor(private opts: FakeSupabaseOptions = {}) {}

  get boxes() {
    return this.opts.boxes ?? [1, 2, 3, 4, 5, 6].map((n) => ({ box_id: n, box_nom: `Box ${n}` }));
  }

  async install(page: Page) {
    await page.route(`${E2E_SUPABASE_URL}/**`, (route) => this.handle(route));
  }

  private json(route: Route, data: unknown, status = 200) {
    return route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(data) });
  }

  private async handle(route: Route) {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (this.opts.delayMs) await new Promise((r) => setTimeout(r, this.opts.delayMs));

    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/rest\/v1\//, "");
    const method = req.method();

    if (method === "GET") {
      const tables: Record<string, unknown[]> = {
        config: this.opts.config ?? [{ heure_ouverture: "14:00", heure_fermeture: "20:00", buffer_minutes: 30 }],
        durees_session: this.opts.durees ?? [
          { id: 1, label: "30 min", duree_minutes: 30 },
          { id: 2, label: "1 h", duree_minutes: 60 },
        ],
        jours_fermeture: this.opts.joursFermeture ?? [],
        periodes_vacances: this.opts.periodesVacances ?? [],
        avis_google: this.opts.avis ?? [],
        boxes: this.boxes.map((b) => ({ id: b.box_id, nom: b.box_nom, type: "filaire" })),
      };
      if (path in tables) return this.json(route, tables[path]);
    }

    if (method === "POST" && path.startsWith("rpc/")) {
      const fn = path.slice(4);
      this.rpcCalls.push({ fn, body: req.postDataJSON() });
      if (fn === "get_boxes_disponibles") return this.json(route, this.boxes);
    }

    if (method === "POST" && (path === "reservations" || path === "reservation_boxes")) {
      const body = req.postDataJSON();
      // Comme en prod : la clé anon peut insérer mais pas relire (pas de policy SELECT),
      // donc un insert avec RETURNING (`.select()`) est refusé par la RLS.
      if ((req.headers()["prefer"] ?? "").includes("return=representation")) {
        this.unhandled.push(`${method} ${url.pathname} avec RETURNING (refusé par la RLS)`);
        return this.json(route, { code: "42501", message: `new row violates row-level security policy for table "${path}"` }, 401);
      }
      this.inserts.push({ table: path, body });
      return route.fulfill({ status: 201, headers: CORS, body: "" });
    }

    this.unhandled.push(`${method} ${url.pathname}${url.search}`);
    return this.json(route, { message: "e2e: requête Supabase non simulée" }, 500);
  }
}

// Fonctions Netlify (/api/*) : absentes d'`astro dev`, simulées ici.
export type ApiCall = { path: string; method: string; body: any; query: URLSearchParams };
type ApiHandler = (call: ApiCall) => { status?: number; body?: unknown } | undefined;

export class FakeApi {
  calls: ApiCall[] = [];
  constructor(private handlers: Record<string, ApiHandler> = {}) {}

  async install(page: Page) {
    await page.route("**/api/**", (route) => this.handle(route));
  }

  callsTo(path: string) {
    return this.calls.filter((c) => c.path === path);
  }

  private handle(route: Route) {
    const req: Request = route.request();
    const url = new URL(req.url());
    let body: any = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    const call: ApiCall = { path: url.pathname, method: req.method(), body, query: url.searchParams };
    this.calls.push(call);
    const res = this.handlers[url.pathname]?.(call) ?? { status: 200, body: { ok: true } };
    return route.fulfill({ status: res.status ?? 200, contentType: "application/json", body: JSON.stringify(res.body ?? {}) });
  }
}

/** Fixe « maintenant » pour le navigateur (le calendrier et les créneaux en dépendent). */
export async function setNow(page: Page, iso: string) {
  await page.clock.setFixedTime(new Date(iso));
}
