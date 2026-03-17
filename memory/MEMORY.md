# VR Café — Mémoire projet

## Package manager
- **bun** (pas pnpm) — `packageManager: bun@1.3.2`, lockfile: `bun.lock`
- Commandes : `bun install`, `bun dev`, `bun run build`, `bun astro check`

## Stack
- Astro 5 SSR + Netlify adapter
- Tailwind CSS v4 (via Vite plugin)
- Sanity CMS (project: 0oshw5tf, dataset: production)
- Supabase (PostgreSQL) pour le système de réservation
- Vanilla JS côté client (pas de React dans les pages)
- Dark mode par défaut (`class="dark"` sur `<html>`)

## Système de réservation (branche vrbooking)
- Supabase URL : https://jzyeylrdwpzhiaqhsaub.supabase.co
- Client partagé : `src/lib/supabase.js`
- Page publique : `src/pages/reservation.astro` (formulaire multi-étapes)
- Back-office : `src/pages/admin/reservations.astro`
- Tables clés : boxes, reservations, reservation_boxes, config, durees_session
- Fonction RPC Supabase : `get_boxes_disponibles(p_debut, p_fin_blocage)`

## Conventions
- Langue : français (site et code UI)
- Couleur primaire : blue-700 (`rgb(29, 78, 216)`)
- Layout de base : `BaseLayout.astro` (NavBar + Footer + WhatsApp)
