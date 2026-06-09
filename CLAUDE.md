# CLAUDE.md

Ce fichier fournit des instructions à Claude Code (claude.ai/code) pour travailler dans ce dépôt.

## Vue d'ensemble du projet

Site web complet d'un VR Café (vr-cafe.fr) construit avec Astro 6 + Sanity CMS + Supabase. Inclut un catalogue de jeux VR, un système de réservation en ligne 4 étapes, un panneau d'administration complet, des notifications push et des emails transactionnels via Mailjet.

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

- **Astro 6** en mode SSR (`output: "server"`)
- **Adaptateur Netlify** pour le déploiement (fonctions Netlify dans `netlify/functions/`)
- **Sanity CMS** :
  - Project ID : `0oshw5tf` / Dataset : `production`
  - Studio accessible sur `/studio`
  - API version : `2025-01-28`, CDN activé
  - Types générés dans `sanity.types.ts` via TypeGen
- **React 19** — uniquement pour Sanity Studio (`/studio`), pas utilisé dans les composants frontend
- **Tailwind CSS v4** via le plugin Vite
- **Supabase** — backend réservations (tables + RPC)
- **Mailjet** — emails transactionnels (confirmation réservation, formulaire contact)
- **Web Push (VAPID)** — notifications admin à chaque nouvelle réservation
- **Google Analytics 4** — chargé via `<script async>` dans `BaseHead.astro` (var `PUBLIC_GA_ID`)
- **Forescape** — widget externe cartes cadeaux (domaine `vrcafe.4escape.io`)

### Structure du projet

```
src/
├── sanity/
│   ├── schemaTypes/         # Schémas de contenu Sanity
│   │   ├── games.ts         # Jeux VR (slug, image, YouTube, tags, difficulté, durée, joueurs, âge)
│   │   ├── tag.ts           # Tags/catégories (jeuxVR, escapeGame, freeroaming, escapeFreeroaming)
│   │   ├── editeur.ts       # Éditeurs/développeurs de jeux
│   │   └── index.ts         # Exports des schémas
│   └── lib/
│       ├── queries.ts       # Toutes les GROQ queries (GAME_PATHS, GAME_BY_SLUG, JEUX_VR, FAQS, TARIFS)
│       ├── load-query.ts    # Helper de requêtes Sanity (sanityClient.fetch avec filterResponse: false)
│       └── url-for-image.ts # Constructeur d'URL d'images Sanity
├── lib/
│   ├── supabase.js          # Client Supabase (PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY)
│   └── notify.ts            # Web push via web-push (notifyNewReservation, VAPID)
├── components/              # 30 composants Astro
├── layouts/
│   ├── BaseLayout.astro     # Layout public (NavBar + Footer + WhatsApp button)
│   ├── BaseHead.astro       # Head HTML (meta SEO, GA4, favicon)
│   ├── AdminLayout.astro    # Layout admin (header + service worker push)
│   └── GamesLayout.astro   # Layout liste de jeux
├── pages/
│   ├── index.astro          # Accueil (hero, features, tarifs, FAQ, partenaires)
│   ├── vr.astro             # Hub VR filaire (Escapes + Jeux)
│   ├── vr-sans-fil.astro    # Hub VR Sans Fil (Escapes + Jeux)
│   ├── jeux.astro           # Liste jeux VR filaires (tag: jeuxVR)
│   ├── escapes.astro        # Liste escape games filaires (tag: escapeGame)
│   ├── freeroaming.astro    # Liste jeux sans fil (tag: freeroaming)
│   ├── escapesFreeroaming.astro  # Escapes sans fil (tag: escapeFreeroaming)
│   ├── [...slug].astro      # Pages détail jeu dynamiques (YouTube + bouton réserver)
│   ├── reservation.astro    # Formulaire réservation client
│   ├── contact.astro        # Formulaire contact
│   ├── contact/merci.astro  # Confirmation contact
│   ├── cadeaux.astro        # Cartes cadeaux (info + FAQ)
│   ├── giftCard.astro       # Widget Forescape cartes cadeaux
│   └── admin/
│       ├── login.astro      # Login admin (POST → cookie admin_session 30j)
│       ├── index.astro      # Redirect → /admin/reservations
│       ├── reservations.astro  # Tableau réservations du jour
│       ├── reservation.astro   # Nouvelle réservation (mode admin)
│       ├── planning.astro      # Planning semaine/jour (vue boxes + vacances/fermetures)
│       ├── clients.astro       # CRM clients (fidèles, inactifs, tous + historique)
│       └── marketing.astro     # Stats marketing + liens Mailjet
├── middleware.ts            # Auth admin (vérifie cookie admin_session vs ADMIN_PASSWORD)
├── assets/                  # Images WebP (partenaires, logos)
└── styles/global.css        # Tailwind + styles globaux

netlify/
├── functions/               # Fonctions serverless Netlify
│   ├── reservation-confirmation.mts  # POST /api/reservation-confirmation
│   ├── contact.mts                   # POST /api/contact (CSRF HMAC-SHA256)
│   ├── push-notify.mts               # POST /api/push-notify
│   ├── push-subscribe.mts            # POST /api/push/subscribe (auth admin)
│   ├── admin-db.mts                  # POST /api/admin-db (auth admin, multi-actions DB)
│   ├── reservation-annulation.mts    # Annulation réservation
│   └── whatsapp-webhook.mts          # Webhook WhatsApp (non utilisé actuellement)
└── lib/
    └── mailjet-contacts.ts           # Sync contacts Mailjet

public/
└── sw.js                    # Service Worker notifications push
```

### Schémas Sanity

**Types de contenu (définis dans `src/sanity/schemaTypes/`) :**
- **`games`** : jeux VR — `name`, `slug`, `image`, `youtubeLink`, `description`, `tag` (ref Editeur), `editeur` (ref Editeur), `players`, `duration`, `difficulty`, `age`, `tags[]` (array of ref Tag)
- **`tag`** : catégories — `title` (valeurs : `jeuxVR`, `escapeGame`, `freeroaming`, `escapeFreeroaming`)
- **`editeur`** : éditeurs/développeurs — `name`
- **`faq`** : FAQ — `question`, `reponse`, `categorie`, `ordre` (fetch dans `FAQ.astro` avec fallback hardcodé)
- **`tarif`** : tarifs — `name`, `prix`, `description`, `isPromo`, `nbJoueurs`, `dureeMinutes` (fetch dans `Pricing.astro` avec fallback hardcodé)

**Requêtes GROQ (`src/sanity/lib/queries.ts`) :**
- `GAME_PATHS_QUERY` — slugs de tous les jeux (pour `getStaticPaths`)
- `GAME_BY_SLUG_QUERY` — jeu complet par slug
- `JEUX_VR_QUERY` — jeux filtrés par tag `jeuxVR`
- `FAQS_QUERY` — FAQ triée par `ordre`
- `TARIFS_QUERY` — tarifs triés par `ordre`

### Composants principaux

**Réservation :**
- `ReservationForm.astro` — formulaire 4 étapes complet (voir section Système de réservation)
- `DatePicker.astro` — calendrier custom avec gestion vacances/jours fermés (input hidden pour valeur ISO)
- `ReservationGift.astro` — iframe widget Forescape cartes cadeaux

**Catalogue jeux :**
- `GameList.astro` — grille 3 colonnes responsive de `Card.astro`
- `Card.astro` — carte jeu (image, titre, lien slug)
- `YoutubePlayer.astro` — lecteur YouTube en modal sur page détail jeu

**Images :**
- `SanityPicture.astro` — images Sanity (image builder avec hotspot)
- `CriticalImage.astro` — images LCP (above the fold)
- `LandingImage.astro` — images hero

**Contenu :**
- `FAQ.astro` — accordéon FAQ (fetch Sanity ou fallback hardcodé)
- `Pricing.astro` → `PricingCard.astro` — tarifs (fetch Sanity ou fallback hardcodé)
- `Partners.astro` — logos partenaires (Ubisoft, Wanadev, etc.)
- `Features.astro` — section avantages

**Navigation :**
- `NavBar.astro` — navbar sticky avec dropdowns VR/VR Sans Fil, bouton Réserver, responsive mobile
- `Footer.astro` — footer avec contact, liens, réseaux sociaux
- `WhatsAppButton.astro` — bouton WhatsApp flottant

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

`AdminLayout.astro` enregistre le service worker et demande la permission push à chaque chargement de page admin.

### Endpoints API (Netlify Functions)

| Endpoint | Authentification | Description |
|----------|-----------------|-------------|
| `POST /api/reservation-confirmation` | CORS origin | Email confirmation client + sync contact Mailjet |
| `POST /api/contact` | CORS + CSRF HMAC-SHA256 | Email formulaire contact via Mailjet |
| `POST /api/push-notify` | — | Envoi notification push (web-push VAPID) |
| `POST /api/push/subscribe` | Cookie `admin_session` | Enregistre un abonnement push dans Supabase |
| `POST /api/admin-db` | Cookie `admin_session` | Multi-actions : update résa, vacances, fermetures, boxes |
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

**Sécurité :**
- CSRF via HMAC-SHA256 sur le formulaire contact
- Cookie `admin_session` httpOnly + secure sur toutes les routes `/admin/*`
- Validation CORS origin sur les endpoints API critiques
