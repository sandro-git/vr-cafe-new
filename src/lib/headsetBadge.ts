export type HeadsetType = "filaire" | "sans_fil";

export const HEADSET_LABELS: Record<HeadsetType, string> = {
  filaire: "Filaire",
  sans_fil: "Sans fil",
};

const HEADSET_ICONS: Record<HeadsetType, string> = {
  filaire:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v4"/><path d="M17 9V5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v4"/><path d="M4 9h16v3a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V9Z"/><path d="M12 18v3"/></svg>',
  sans_fil:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M12 20h.01"/></svg>',
};

/**
 * Rendu HTML du badge filaire/sans-fil, identique visuellement au composant
 * HeadsetBadge.astro. Utilisé côté client (innerHTML) dans les formulaires de
 * réservation, où Astro ne peut pas rendre de composant dynamiquement.
 */
export function headsetBadgeHtml(type: HeadsetType, size: "sm" | "md" = "sm"): string {
  const sizeClasses =
    size === "md" ? "px-3 py-1.5 text-xs gap-1.5" : "px-2.5 py-1 text-[11px] gap-1";
  return `<span class="inline-flex items-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/15 font-semibold uppercase tracking-wide text-white ${sizeClasses}">${HEADSET_ICONS[type]}${HEADSET_LABELS[type]}</span>`;
}
