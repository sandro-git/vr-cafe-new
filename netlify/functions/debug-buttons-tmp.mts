import type { Context, Config } from "@netlify/functions";
import { generateReservationToken } from "../lib/reservation-token.ts";

const MIN_NOTICE_MS = 24 * 60 * 60 * 1000;

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const creneau_debut = url.searchParams.get("creneau_debut") || "";
  const debut = new Date(creneau_debut);
  const noticeMs = debut.getTime() - Date.now();
  const canSelfManage = !!id && noticeMs >= MIN_NOTICE_MS;
  let actionButtonsHtml = "(vide)";
  if (canSelfManage) {
    const cancelToken = await generateReservationToken(id);
    actionButtonsHtml = `cancelUrl=https://vr-cafe.fr/reservation/annulation?id=${encodeURIComponent(id)}&token=${encodeURIComponent(cancelToken)}`;
  }
  return new Response(JSON.stringify({ id, creneau_debut, noticeMs, canSelfManage, actionButtonsHtml }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = { path: "/api/debug-buttons-tmp" };
