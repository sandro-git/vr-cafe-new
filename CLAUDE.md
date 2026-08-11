# CLAUDE.md

Ce fichier fournit des instructions à Claude Code (claude.ai/code) pour travailler dans ce dépôt.

## Workflow

Toujours tester la fonctionnalité de bout en bout dans le navigateur avant de commit. Une fois que ça fonctionne : commit et push.

## Tech Stack

Projet Astro + TypeScript déployé sur Netlify avec un backend Sanity CMS. Lancer `astro check` pour détecter les erreurs de type, et nettoyer les bundles SSR obsolètes avant de vérifier via `netlify dev`.

## Vue d'ensemble du projet

Site web complet d'un VR Café (vr-cafe.fr) construit avec Astro 7 + Sanity CMS + Supabase. Inclut un catalogue de jeux VR, un système de réservation en ligne 4 étapes, un panneau d'administration complet, des notifications push et des emails transactionnels via Mailjet.

## Commandes de développement

Toutes les commandes utilisent `bun` et doivent être exécutées depuis la racine du projet :

- **`bun install`** - Installer les dépendances
- **`bun dev`** - Démarrer le serveur de développement Astro seul sur `localhost:4321` (⚠️ ne charge pas les Netlify Functions ni les env Netlify — à éviter)
- **`netlify dev`** - **Mode dev par défaut** sur `localhost:8888` : sert Astro + les Netlify Functions (`/api/*`) + injecte les variables d'env Netlify (project settings + `.env`). À utiliser systématiquement dès qu'on teste réservation, contact, push, admin-db, etc.
- **`bun run build`** - Construire le site en production dans `./dist/`
- **`bun run preview`** - Prévisualiser le build de production en local
- **`bun astro ...`** - Exécuter les commandes Astro CLI (ex. `bun astro check`)

## Architecture

### Framework & Intégrations

- **Astro 7** en mode SSR (`output: "server"`)
- **Adaptateur Netlify** pour le déploiement (fonctions Netlify dans `netlify/functions/`)
- **Sanity CMS** (headless) :
  - Project ID : `0oshw5tf` / Dataset : `production`
  - Le Studio est un projet **standalone** dans `vr-cafe-studio/` (plus de studio embarqué sur `/studio`) ; le site n'utilise `@sanity/astro` que comme client de données (`loadQuery`)
  - API version : `2025-01-28`, CDN activé
  - Types générés dans `sanity.types.ts` via TypeGen
- **Tailwind CSS v4** via le plugin Vite
- **Supabase** — backend réservations (tables + RPC)
- **Mailjet** — emails transactionnels (confirmation réservation, formulaire contact)
- **Web Push (VAPID)** — notifications admin à chaque nouvelle réservation
- **Google Analytics 4** — chargé via `<script async>` dans `BaseHead.astro` (var `PUBLIC_GA_ID`)
- **Forescape** — widget externe cartes cadeaux (domaine `vrcafe.4escape.io`)

### Système de réservation

**Flux complet :**

1. **Étape 1 — Date + config** : charge depuis Supabase (`config`, `durees_session`, `jours_fermeture`, `periodes_vacances`), sélection date + nb personnes + type VR (filaire/sans_fil) + durée
2. **Étape 2 — Créneau** : génère les slots de 30min dans la plage horaire, appelle RPC `get_boxes_disponibles` pour chaque slot, affiche les créneaux disponibles
3. **Étape 3 — Infos client** : nom, email, téléphone, notes (+ autocomplete admin depuis historique Supabase)
4. **Étape 4 — Confirmation** :
   - Insert `reservations` + `reservation_boxes` dans Supabase
   - POST `/api/reservation-confirmation` → email Mailjet client + sync contact Mailjet
   - POST `/api/push-notify` → notification push aux admins abonnés
   - Client : page de confirmation | Admin : redirect `/admin/planning`

**Tarification (hardcodée dans `ReservationForm.astro` et `reservation-confirmation.mts`) :**
- 30 min : 18 €/personne
- 60 min : 29 € (1-2 pers.) / 27 € (3-4 pers.) / 25 € (5+ pers.) par personne

**Tables Supabase :**
- `reservations` — données client + créneau + statut
- `reservation_boxes` — association réservation ↔ box
- `boxes` — salles VR (`box_nom`, `vr_type`: filaire ou sans_fil)
- `durees_session` — durées disponibles (`label`, `duree_minutes`, `actif`)
- `config` — config globale (`heure_ouverture`, `heure_fermeture`, `buffer_minutes`, `nb_boxes`)
- `jours_fermeture` — dates de fermeture exceptionnelles
- `periodes_vacances` — périodes de vacances scolaires
- `push_subscriptions` — abonnements Web Push admin

**RPC Supabase :** `get_boxes_disponibles(p_debut, p_fin, p_type_vr)` — retourne les boxes libres pour un créneau

### Section admin

Protégée par `src/middleware.ts` (cookie `admin_session` httpOnly, 30j, comparé à `ADMIN_PASSWORD`).

- `/admin/reservations` — tableau des réservations du jour (filtré par date)
- `/admin/planning` — vue planning semaine/jour avec état des boxes + gestion vacances/jours fermés
- `/admin/reservation` — nouvelle réservation (même `ReservationForm` en mode `"admin"`, avec autocomplete client)
- `/admin/clients` — CRM : liste clients filtrée (fidèles, inactifs, tous) + historique des réservations
- `/admin/marketing` — stats (fidèles, inactifs, nouveaux) + liens vers Mailjet
- `/admin/aide` — chat d'aide opérationnelle pour les collaborateurs (questions suggérées + saisie libre), répond uniquement à partir de `content/staff-guide.md` via Claude Haiku 4.5

`AdminLayout.astro` enregistre le service worker et demande la permission push à chaque chargement de page admin.

### Endpoints API (Netlify Functions)

| Endpoint | Authentification | Description |
|----------|-----------------|-------------|
| `POST /api/reservation-confirmation` | CORS origin | Email confirmation client + sync contact Mailjet |
| `POST /api/contact` | CORS + CSRF HMAC-SHA256 | Email formulaire contact via Mailjet |
| `POST /api/push-notify` | — | Envoi notification push (web-push VAPID) |
| `POST /api/push/subscribe` | Cookie `admin_session` | Enregistre un abonnement push dans Supabase |
| `POST /api/admin-db` | Cookie `admin_session` | Multi-actions : update résa, vacances, fermetures, boxes |
| `POST /api/admin/chat` | Cookie `admin_session` | Chat d'aide opérationnelle (Claude Haiku 4.5), répond à partir de `content/staff-guide.md` compilé au build |
| `POST /api/reservation-annulation` | — | Annulation réservation |

**CORS origins autorisées :** `https://vr-cafe.fr`, `https://www.vr-cafe.fr`, `http://localhost:4321`

### Notifications push web

- `src/lib/notify.ts` — `notifyNewReservation()` diffuse à tous les abonnements Supabase (`push_subscriptions`)
- Supprime automatiquement les abonnements expirés (réponses HTTP 410/404)
- `public/sw.js` — Service Worker (enregistré par `AdminLayout.astro`)
- Clés VAPID : `PUBLIC_VAPID_KEY`, `PRIVATE_VAPID_KEY`, `VAPID_EMAIL`

### Variables d'environnement

```env
# Sanity
PUBLIC_SANITY_PROJECT_ID=0oshw5tf
PUBLIC_SANITY_DATASET=production

# Supabase
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...     # Fonctions Netlify uniquement

# Admin
ADMIN_PASSWORD=...

# Web Push
PUBLIC_VAPID_KEY=...
PRIVATE_VAPID_KEY=...
VAPID_EMAIL=...

# Mailjet
MAILJET_API_KEY=...
MAILJET_API_SECRET=...
MAILJET_SENDER_EMAIL=contact@vr-cafe.fr

# Anthropic (chat aide admin, réponses aux avis Google, agent WhatsApp)
ANTHROPIC_API_KEY=...

# Google Analytics
PUBLIC_GA_ID=G-XXXXXXXXXX
```

### Déploiement

- **Plateforme** : Netlify
- **Commande de build** : `bun run build`
- **Répertoire de publication** : `dist`
- **Package manager** : Bun 1.3.2
- **Configuration spéciale** : headers `.well-known` configurés dans `netlify.toml` (Apple Pay et services similaires)

## Patterns de code

**Composants Astro :**
- Frontmatter `---` pour la récupération de données côté serveur
- `BaseLayout` encapsule toutes les pages publiques ; `AdminLayout` encapsule `/admin/*`
- Hauteur de navigation fixe : `--navHeight: 8rem`
- Mode sombre activé par défaut (`class="dark"` sur `<html>`)
- Défilement fluide : `scroll-padding-top: var(--navHeight)`

**Requêtes Sanity :**
- Importer `loadQuery` depuis `src/sanity/lib/load-query.ts`
- Types générés disponibles dans `sanity.types.ts`
- Accéder aux résultats via `.data`

**Requêtes Supabase :**
- Client importé depuis `src/lib/supabase.js`
- Pour les fonctions Netlify : utiliser `SUPABASE_SERVICE_ROLE_KEY` (accès service role)
- RPC `get_boxes_disponibles` pour vérifier la disponibilité des boxes

**SEO / données structurées (JSON-LD) :**
- Helpers centralisés dans `src/lib/seo.ts` (`businessNode`, `graph`, `breadcrumb`, `service`, `product`, `faqPage`, `itemList`, `gameListSchema`)
- Composant `src/components/JsonLd.astro` pour émettre un bloc `<script type="application/ld+json">`
- Convention : une page émet un `graph([businessNode, breadcrumb([...]), <schéma page>])` ; `businessNode` doit rester dans le `@graph` pour que les `provider`/`brand` `{"@id": ".../#business"}` se résolvent
- `FAQ.astro` émet automatiquement un `FAQPage` dès qu'il affiche des questions
- Image OG (`public/og-image.jpg`, 1200×630) régénérable via `node scripts/gen-og-image.mjs`

**Sécurité :**
- CSRF via HMAC-SHA256 sur le formulaire contact
- Cookie `admin_session` httpOnly + secure sur toutes les routes `/admin/*`
- Validation CORS origin sur les endpoints API critiques

## Design System (refonte 2026)

Refonte visuelle complète appliquée à **tout le site public** (mergée sur `master`) **et au back-office `/admin/*`** (branche `redesign`, voir « Back-office » plus bas).

**Tokens** — définis dans `src/styles/global.css` via `@theme` (Tailwind v4) :
- Couleurs : `brand-50…900` (violet, base #8b5cf6), `accent-300/400/500` (jaune), `glow-pink/blue/cyan`, surfaces `surface` (#0b0b14) / `surface-elevated` (#14141f) / `surface-card` (#1c1c2b) / `surface-border`, textes `text-strong/base/muted/faded`.
- Typo : `--font-display` = Space Grotesk (titres `h1/h2/h3` + classe `.font-display`).
- Espacement section, radius (`--radius-card` 1.25rem, `--radius-pill`), motion (`--ease-out-soft`, `--dur-fast/base/slow`).
- S'utilisent en arbitraire : `bg-[var(--color-surface)]`, `text-[var(--color-brand-300)]`, etc. Pour les couleurs auto-générées en utilitaire : `text-brand-900`, `bg-accent-400` (⚠️ jamais `text-[--color-x]` sans `var()` — invalide en Tailwind v4).

**Utilities custom** (global.css) : `reveal` / `reveal-stagger` (apparition au scroll), `mesh-bg`, `card-glow` (carte fond surface-card + bord gradient brand au hover), `text-shimmer` (dégradé animé sur un mot-clé de titre), `orb` (lueurs floues, responsives via clamp côté Hero), `marquee-track`, `pulse-ring`, `dropdown-anim`, `bounce-soft`.
- ⚠️ **Ne jamais mettre `reveal` sur une grille unique très haute** (ex. liste de 20+ cartes) : l'IntersectionObserver (`threshold 0.08`) ne se déclenche jamais → contenu invisible. Mettre `reveal` sur des blocs courts, ou rien.

**Composants réutilisables** :
- `src/components/PageHeader.astro` — en-tête de page : props `eyebrow`, `title`, `highlight` (mot recevant `text-shimmer`), `subtitle`, `align`, slot par défaut pour les CTA.
- `src/components/Button.astro` — variants `primary` (blanc/brand) / `secondary` (outline) / `ghost` / `accent` (jaune), tailles `sm/md/lg`, supporte `href` (lien) ou `type` (bouton), prop `pulse`.
- `src/components/Section.astro` — wrapper de section (fond, padding, reveal).

**Conventions visuelles** :
- Dark par défaut. Fonds `surface` / `surface-elevated` alternés entre sections.
- Rythme vertical : `pt-10 pb-12/16 lg:pt-14 lg:pb-16/28` (pt resserré).
- Titres de section : `font-display ... font-extrabold tracking-tight text-white` + `text-shimmer` sur un mot.
- Cartes : `card-glow group p-X` + `hover:-translate-y-1` ; textes `text-white` / `text-white/70` / `text-white/55`.
- Champs de formulaire : `bg-white/5 ring-1 ring-white/10 focus:ring-2 focus:ring-[var(--color-brand-400)]`. CTA via `Button`. Pas de bleu/violet brut → palette brand.
- Emojis décoratifs : placés dans des tuiles gradient brand (pas en gros emojis flottants).

**Motion** :
- `BaseLayout.astro` active `ClientRouter` (View Transitions) + un `IntersectionObserver` inline pour le reveal-on-scroll (réinitialisé sur `astro:page-load`, respecte `prefers-reduced-motion`).
- ⚠️ **Tout `<script>` qui attache des listeners doit se réexécuter sur `astro:page-load`** (sinon cassé après navigation View Transitions) et utiliser un flag `data-*-bound` anti-doublon — pattern dans `NavBar.astro`, `FAQ.astro`, `[...slug].astro`.

**Formulaires de réservation** (`ReservationForm`, `ReservationFormAnniversaire`, `ReservationFormMDJ`) :
- Supabase chargé en **import dynamique** (`ensureSupabase()`) appelé dans `init()` après le rendu UI → l'étape 1 s'affiche même si le chunk Supabase échoue (504 Vite dev).
- Badges d'étape alternés : étape 1 bleu, 2 rose, 3 cyan (gradients glow-*→brand).

**Dev / test** :
- `netlify dev --port 8888 --offline`. Accès LAN (mobile réel) : `http://192.168.1.55:8888` (activé par `vite.server.host: true` dans `astro.config.mjs`).
- `devToolbar` désactivée (astro.config.mjs) pour le confort mobile.
- Le bouton WhatsApp flottant (`FloatingActions`) est **commenté** dans `BaseLayout.astro` (à replacer ailleurs plus tard).

**Back-office `/admin/*` (refonte faite, branche `redesign`)** :
- `AdminLayout.astro` : fond `surface` + **topbar unifiée persistante** (wordmark « VR Café · Admin » ≥ sm, nav Réservations/Planning/Clients/Marketing avec onglet actif détecté via `Astro.url.pathname`, CTA « + Réserver » brand, liens scrollables sur mobile via `.no-scrollbar`). Le `<slot>` est dans un `<div class="pt-14">` (PAS un `<main>` : chaque page admin a déjà son propre `<main>`). Script service worker / push conservé.
- Pages refaites en palette design system **sobre & dense** (pas de shimmer/reveal/orbs) : `login`, `reservations`, `clients`, `marketing`, `planning`, `reservation`. Stats cards `bg-[var(--color-surface-card)] border-white/10`, champs `bg-white/5 ring-1 ring-white/10 focus:ring-[var(--color-brand-400)]`, modales `bg-black/60 backdrop-blur-sm` + panneau surface-card, spinners `border-t-[var(--color-brand-400)]`.
- **Couleurs sémantiques conservées** (elles portent du sens métier, ne pas “brandifier”) : badges de statut (confirmée vert / annulée rouge / no_show jaune) en `*-500/15` + `text-*-300` + `border-*-500/30` ; types de résa (anniversaire rose, MDJ violet) ; **couleurs inline des blocs du planning** (`statusClass` ligne ~455 : sans-fil vert / filaire>30 bleu / filaire≤30 violet / anniv rose) + la légende correspondante.
- **Logique métier intouchée** : middleware/cookie `admin_session`, scripts Supabase + RPC `get_boxes_disponibles`, `/api/admin/db` (+ `/api/reservation-annulation`), `calcMontant`, DatePicker, autocomplete, auto-refresh planning, layout JS anti-overlap. Seules les classes Tailwind ont changé.
- ⚠️ Tailwind v4 : toujours `var()` dans l'arbitraire (`text-[var(--color-brand-300)]`, jamais `text-[--color-brand-300]`). Les pages admin n'utilisent **pas** `reveal` (back-office = rapidité, pas d'animation au scroll).
- Les formulaires de réservation admin (`ReservationForm` mode admin, MDJ, Anniversaire) étaient déjà au design system — réutilisés tels quels.
