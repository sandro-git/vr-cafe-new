# CLAUDE.md

Ce fichier fournit des instructions à Claude Code (claude.ai/code) pour travailler dans ce dépôt.

## Vue d'ensemble du projet

Site web d'un VR Café construit avec Astro 6, utilisant Sanity CMS pour la gestion de contenu. Le site est déployé sur Netlify avec le rendu côté serveur (SSR).

## Commandes de développement

Toutes les commandes utilisent `bun` et doivent être exécutées depuis la racine du projet :

- **`bun install`** - Installer les dépendances
- **`bun dev`** - Démarrer le serveur de développement sur `localhost:4321`
- **`bun run build`** - Construire le site en production dans `./dist/`
- **`bun run preview`** - Prévisualiser le build de production en local
- **`bun astro ...`** - Exécuter les commandes Astro CLI (ex. `bun astro check`)

## Architecture

### Framework & Intégrations

- **Astro 6** en mode SSR (`output: "server"`)
- **Adaptateur Netlify** pour le déploiement
- **Sanity CMS** :
  - Project ID : `0oshw5tf`
  - Dataset : `production`
  - Studio accessible sur la route `/studio`
  - Utilise l'intégration `@sanity/astro` avec l'outil Vision
- **React 19** - Uniquement requis pour Sanity Studio (`/studio`), non utilisé dans les composants frontend
- **Tailwind CSS v4** via le plugin Vite
- **Google Analytics / GTM** chargés directement via `<script async>` dans `BaseHead.astro` (Partytown abandonné)

### Structure du projet

```
src/
├── sanity/
│   ├── schemaTypes/     # Schémas de contenu Sanity
│   │   ├── games.ts     # Type de contenu Jeux
│   │   ├── tag.ts       # Type de contenu Tag
│   │   ├── editeur.ts   # Type de contenu Éditeur
│   │   └── index.ts     # Exports des schémas
│   └── lib/
│       ├── load-query.ts    # Helper de requêtes Sanity
│       └── url-for-image.ts # Constructeur d'URL d'images
├── components/          # Composants Astro/React
├── layouts/
│   ├── BaseLayout.astro     # Layout principal avec NavBar, Footer, WhatsApp
│   ├── BaseHead.astro       # Balises SEO et meta
│   └── GamesLayout.astro    # Layout pour les pages de jeux
├── pages/               # Routage basé sur les fichiers
│   ├── index.astro
│   ├── [...slug].astro  # Pages de détail des jeux (dynamiques)
│   ├── jeux.astro       # Liste des jeux
│   ├── contact.astro
│   ├── reservation.astro
│   └── ...              # Autres pages statiques
├── assets/              # Ressources statiques
└── styles/              # Styles globaux
```

### Patterns architecturaux clés

**Intégration Sanity CMS :**
- Le contenu est récupéré avec `loadQuery()` depuis `src/sanity/lib/load-query.ts`
- Les types de schémas sont définis dans `src/sanity/schemaTypes/` et exportés via `index.ts`
- Le client Sanity est configuré pour utiliser le CDN pour les performances
- Toutes les requêtes utilisent `sanityClient.fetch()` avec `filterResponse: false`

**Types de contenu :**
- **games** : contenu des jeux VR avec slug, image, liens YouTube, tags, difficulté, durée, joueurs, âge minimum
- **tag** : système de catégories/tags pour les jeux
- **editeur** : éditeurs/développeurs de jeux

**Gestion des images :**
- Utiliser `SanityPicture.astro` pour les images provenant de Sanity
- `CriticalImage.astro` pour les images au-dessus de la ligne de flottaison
- `LandingImage.astro` pour les sections hero
- Toutes les images Sanity supportent le positionnement hotspot

**Optimisation du build :**
- Configuration Vite `manualChunks` personnalisée qui découpe le code en :
  - `sanity-studio` - Sanity Studio (lourd)
  - `sanity-vision` - Outil Vision
  - `video-player` - Composants vidéo
  - `sanity-utils` - Utilitaires client Sanity

**Routage :**
- Pages statiques dans `src/pages/`
- Pages de détail des jeux dynamiques via `[...slug].astro` en utilisant le champ slug de Sanity
- Site en français (`lang="fr"`)

### Système de réservation (branche vrbooking)

La fonctionnalité de réservation ajoute un backend Supabase en complément de Sanity CMS :

**Intégration Supabase (`src/lib/supabase.js`) :**
- Client initialisé avec `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY`
- Tables : `reservations`, `reservation_boxes`, `boxes`, `config`, `durees_session`, `periodes_vacances`, `jours_fermeture`, `push_subscriptions`
- RPC : `get_boxes_disponibles` — retourne les boxes disponibles pour un créneau donné

**Endpoints API (appelés via `fetch`, doivent exister en tant qu'endpoints Astro) :**
- `POST /api/reservation-confirmation` — crée une nouvelle réservation
- `POST /api/reservation-annulation` — annule une réservation
- `POST /api/admin/db` — requêtes base de données admin (protégé par cookie de session)
- `POST /api/push/subscribe` — enregistre un abonnement web push
- `POST /api/push-notify` — envoie une notification push via VAPID

**Section admin (`/admin/*`) :**
- Auth via `src/middleware.ts` : vérifie le cookie `admin_session` contre la variable d'env `ADMIN_PASSWORD`
- `AdminLayout.astro` enregistre le service worker et demande la permission pour les notifications push
- Pages : `/admin/login`, `/admin/reservations`, `/admin/planning`, `/admin/reservation`

**Composant partagé `ReservationForm` :**
- Utilisé sur `/reservation` (mode=`"client"`) et `/admin/reservation` (mode=`"admin"`)
- Formulaire multi-étapes : sélection de date → joueurs/durée → coordonnées → confirmation
- `DatePicker.astro` est un composant calendrier personnalisé avec un input caché pour la valeur ISO de la date

**Notifications push web (`src/lib/notify.ts`) :**
- Utilise la bibliothèque `web-push` avec des clés VAPID
- `notifyNewReservation()` diffuse à tous les abonnements stockés dans la table `push_subscriptions`
- Supprime automatiquement les abonnements expirés (réponses 410/404)

### Variables d'environnement

Requises dans `.env` :
```
PUBLIC_SANITY_PROJECT_ID=0oshw5tf
PUBLIC_SANITY_DATASET=production
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
ADMIN_PASSWORD=...
PUBLIC_VAPID_KEY=...
PRIVATE_VAPID_KEY=...
VAPID_EMAIL=...
```

### Déploiement

- **Plateforme** : Netlify
- **Commande de build** : `bun run build`
- **Répertoire de publication** : `dist`
- **Configuration spéciale** : le répertoire `.well-known` est configuré pour Apple Pay et services similaires (voir `netlify.toml`)

## Patterns de code

**Composants Astro :**
- Utiliser le frontmatter du composant (entre les balises `---`) pour la récupération de données
- BaseLayout fournit NavBar, Footer et le bouton WhatsApp
- Le défilement fluide est configuré avec `scroll-padding-top: var(--navHeight)`

**Requêtes Sanity :**
- Importer `loadQuery` depuis `src/sanity/lib/load-query.ts`
- Utiliser les génériques TypeScript pour des réponses typées : `loadQuery<VotreType>({ query, params })`
- Accéder aux résultats via la propriété `.data`

**Layouts :**
- `BaseLayout` encapsule toutes les pages publiques ; `AdminLayout` encapsule les pages `/admin/*`
- Hauteur de navigation fixe définie comme variable CSS `--navHeight: 8rem`
- Mode sombre activé par défaut (`class="dark"` sur `<html>`)
