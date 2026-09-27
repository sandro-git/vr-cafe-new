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
- **`bun run test`** - Lancer les tests unitaires Vitest une fois (⚠️ pas `bun test`, qui lance le runner intégré de Bun et non Vitest)
- **`bun run test:watch`** - Vitest en mode watch
- **`bun run test:e2e`** - Tests de bout en bout Playwright (⚠️ arrêter d'abord tout `astro dev` / `netlify dev` : Astro n'autorise qu'un serveur de dev par projet)

### Tests unitaires

- **Vitest** configuré via `getViteConfig()` d'Astro (`vitest.config.ts`), tests dans `tests/**/*.test.ts`
- Couvert :
  - `src/lib/pricing.ts` (grille + anniversaire)
  - `netlify/lib/reservation-token.ts` (HMAC)
  - `netlify/lib/reservation-push.ts` (message, une seule notification par réservation, fenêtre de 10 min, id invalide)
  - `netlify/lib/admin-session.ts` (jeton de session admin : valide, expiré, falsifié, secret ou mot de passe changé, lecture du cookie, mot de passe)
  - `netlify/lib/reservation-notice.ts` (règle des 24h)
  - `src/lib/reservation-validation.ts` : email, téléphone, faux numéros, formatage, détection du pays, `validateClientInfo`, et les exemples (`placeholder`) de `COUNTRIES` (chaque exemple doit être valide et appartenir **exactement** à son pays)
  - `src/lib/seo.ts` (JSON-LD) et `src/lib/headsetBadge.ts`
  - `netlify/lib/admin-reads.ts` (lectures admin : requêtes envoyées, validation des paramètres, erreurs) + `/api/admin/db` (401 sans session, service role avec session) ; `src/lib/uuid.ts` (UUID v4)
  - `netlify/lib/reservation-emails.ts` : destinataires, sujets, échappement HTML des saisies client, pas de flexbox
  - `netlify/lib/google-business.ts` (OAuth + cache du jeton, pagination, notes), `generate-review-reply.ts`, `mailjet-contacts.ts` (synchro, changement d'email, suppression RGPD, campagnes), `src/lib/notify.ts` (push, abonnements expirés)
- **Aucun appel réseau réel** : Mailjet, Supabase, Anthropic, web-push sont remplacés par `vi.mock` et `fetch` par `vi.stubGlobal` ; faux client Mailjet réutilisable dans `tests/helpers/mailjet-mock.ts`
- Lancer aussi `bun astro check` après avoir modifié un test : les erreurs de type des tests n'empêchent pas Vitest de passer
- Non testés : `src/lib/supabase.js` (config) et `netlify/lib/staff-guide-content.generated.ts` (généré)
- Avant de durcir une règle de validation, la rejouer en SQL sur les numéros en base (ne remonter que des comptes) pour vérifier l'absence de faux positifs
- **Bloquant au déploiement** : la commande de build Netlify est `bun run test && bun run build` → un test cassé fait échouer le deploy
- `vite` est épinglé en devDependency sur la **même version que celle d'Astro** : sinon Bun remonte une autre version pour Vitest et `astro check` casse (types `Plugin` en double). À réaligner quand on met à jour Astro

### Tests de bout en bout (Playwright)

- `e2e/*.spec.ts`, config `playwright.config.ts` ; utilise le **Chrome installé** (`channel: "chrome"`), pas de navigateur à télécharger. **Pas lancés au build Netlify** (serveur + navigateur) : à lancer en local
- Serveur dédié `astro dev --port 4399` lancé avec `ADMIN_PASSWORD` et `ADMIN_SESSION_SECRET` de test ; les tests posent un cookie `admin_session` **signé** avec ces secrets (`e2e/helpers/admin-session.ts`), **URL Supabase bidon** (`http://supabase.e2e.test`) : tout appel non simulé échoue au lieu de toucher la base de prod
- Supabase (REST/RPC) et les fonctions `/api/*` sont simulés dans le navigateur (`e2e/helpers/mocks.ts` : `FakeSupabase`, `FakeApi`) → aucune réservation, aucun email, aucune réponse Google réellement créés. `FakeSupabase.unhandled` doit rester vide (vérifié après chaque test). Option `delayMs` pour simuler un réseau lent
- Horloge du navigateur fixée (`setNow`) : les tests de réservation se placent le jeudi 1er octobre 2026 à 10:00 (Paris)
- Fichiers (46 tests) :
  - `e2e/admin-login.spec.ts` (5), `e2e/admin-logout-push.spec.ts` (5), `e2e/admin-avis.spec.ts` (7), `e2e/admin-donnees.spec.ts` (6), `e2e/annulation.spec.ts` (10), `e2e/reservation.spec.ts` (13)
  - `e2e/helpers/mocks.ts` : `FakeSupabase` (tables `config`, `durees_session`, `jours_fermeture`, `periodes_vacances`, `avis_google`, `boxes`, RPC `get_boxes_disponibles`, inserts `reservations` / `reservation_boxes` enregistrés dans `.inserts`), `FakeApi` (appels `/api/*` enregistrés, réponse par défaut `{ ok: true }`, handlers par chemin), `setNow`. Comme en prod, `FakeSupabase` **ne sert pas** `reservations` / `clients` en lecture et **refuse un insert avec `RETURNING`** (`.select()` après `.insert()`)
  - `e2e/helpers/reservation-steps.ts` : `chooseSlot` (étapes 1 et 2 du formulaire standard)
  - `e2e/helpers/admin-session.ts` : cookie de session admin signé pour les tests
  - `e2e/global-setup.ts` : préchauffage (voir plus bas)
- Couvert : `/admin/login` (cookie signé sans le mot de passe, mauvais mot de passe, ancien cookie en clair refusé, déconnexion, déconnexion refusée en GET), désabonnement push à la déconnexion (ordre désabonnement → suppression serveur → déconnexion, refus du navigateur, service worker en erreur, serveur muet > 2 s), lectures admin via `/api/admin/db` (`/admin/reservations`, `/admin/planning`, `/admin/clients`, `/admin/marketing`, autocomplete de `/admin/reservation`), `/admin/avis` (publier, brouillon vide, confirmation annulée, régénérer, erreurs), `/reservation/annulation` (tous les états, modifier standard/anniversaire/MDJ), `/reservation` (parcours complet, créneaux, box insuffisantes, jours fermés, validation, modification, réseau lent)
- `ASTRO_DEV_BACKGROUND=1` dans `webServer.env` : sinon Astro 7 détecte un agent IA et passe `astro dev` en arrière-plan, ce que Playwright prend pour un plantage
- `e2e/global-setup.ts` précharge les pages jusqu'à ce que Vite ne les recharge plus (il re-prépare ses dépendances à chaque démarrage et recharge les pages ouvertes, ce qui cassait des tests au hasard)
- **Écrire un test** : installer `FakeSupabase` / `FakeApi` (et `setNow` si le calendrier intervient) **avant** `page.goto`, puis vérifier ce que la page a envoyé (`supabase.inserts`, `api.callsTo('/api/…')`) plutôt que seulement l'affichage ; toute nouvelle requête Supabase de la page doit être ajoutée au faux Supabase (sinon `unhandled` fait échouer le test)
- **Lancer une partie** : `bunx playwright test e2e/reservation.spec.ts -g "modification"`
- **Déboguer un échec** : la trace est gardée dans `test-results/` (ignoré par git) → `bunx playwright show-trace test-results/<test>/trace.zip` (DOM, réseau et console pas à pas)
- Vérifier qu'un nouveau test n'est pas aléatoire : `bunx playwright test --repeat-each=5` (idéalement aussi après `rm -rf node_modules/.vite`, cache Vite vide)
- **Datepicker** : une date cliquée avant l'arrivée de la configuration Supabase est revalidée puis ré-émise (ou effacée si fermée) à la réception de `datepicker:init` ; les formulaires doivent donc poser leur écoute `datepicker:select` **avant** de dispatcher `datepicker:init`

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
   - Validation partagée `src/lib/reservation-validation.ts` (formulaires standard/anniversaire/MDJ côté client **et** `reservation-confirmation.mts` côté serveur ; `isValidPhone`/`detectPhoneCountry` aussi dans l'admin) :
     - **Email** : format + domaines bidons refusés (`example.com`, `exemple.fr`, `test.fr`, `mdj.fr`…)
     - **Téléphone** : validé avec `libphonenumber-js` selon le pays choisi (liste courte `COUNTRIES`) ; « Autre pays » exige l'indicatif `+` ; stocké au format international (`formatPhoneForStorage`, ex. `+33 6 71 41 06 95`)
     - **Faux numéros** (`isFakePhone`) : placeholders connus (dont l'exemple FR `06 12 34 56 78`, refusé volontairement), puis sur le numéro **sans son chiffre de préfixe** : chiffres tous identiques, et à partir de 6 chiffres paire répétée (`06 12 12 12 12`) ou suite croissante/décroissante (`07 12 34 56 78`)
     - **Pays d'un numéro stocké** (`detectPhoneCountry`, pour préremplir le sélecteur en édition admin) : un territoire hors liste qui partage l'indicatif d'un pays de la liste retombe sur ce pays (Guernesey/Jersey/île de Man en `+44` → Royaume-Uni)
4. **Étape 4 — Confirmation** :
   - Insert `reservations` + `reservation_boxes` dans Supabase (clé anon). L'`id` est généré par le navigateur (`newReservationId()`, `src/lib/uuid.ts`) et l'insert se fait **sans `.select()`** : la clé anon peut insérer mais pas relire les réservations (voir « Données personnelles et RLS »). Les champs envoyés à l'email et au push viennent des valeurs locales
   - POST `/api/reservation-confirmation` → email Mailjet client + sync contact Mailjet
   - POST `/api/push-notify {id}` → notification push aux admins abonnés (texte construit côté serveur, une seule fois par réservation, voir « Notifications push web »)
   - Client : page de confirmation | Admin : redirect `/admin/planning`

**Tarification standard et MDJ** — grille codée en dur dans `calcMontant()` (`src/lib/pricing.ts`), utilisée directement par `ReservationForm` (écran de confirmation) et, via `calcMontantReservation()`, par `reservation-confirmation.mts` (email) et le CA de `/admin/reservations` :
- 30 min : 18 €/personne
- 60 min : 29 € (1-2 pers.) / 27 € (3-4 pers.) / 25 € (5+ pers.) par personne
- ⚠️ Les prix affichés sur `/tarifs` viennent de Sanity (documents `tarif` de type `session_30min` / `session_1h`) : un changement de prix doit être fait **aux deux endroits**.

**Tarification anniversaire** — prix par personne lu dans Sanity (document `tarif` de type `anniversaire`, 25 €/pers., 1h, minimum 5 enfants), affiché sur `/anniversaire`. Dans l'email de confirmation, `reservation-confirmation.mts` lit `type_reservation` en base et, pour un anniversaire, calcule `prix Sanity × nb_personnes` via `getPrixAnniversaire()` (API CDN Sanity, timeout 3 s, repli `PRIX_ANNIVERSAIRE_DEFAUT` = 25 €). Changer le prix dans Sanity suffit pour la page, l'email et le CA admin. Le calcul par type est centralisé dans `calcMontantReservation()` (`src/lib/pricing.ts`), utilisé par l'email et par le CA de `/admin/reservations` (prix anniversaire lu dans Sanity au rendu de la page, passé au script via `data-prix-anniversaire`).

**Tables Supabase :**
- `reservations` — données client + créneau + statut
- `reservation_boxes` — association réservation ↔ box
- `boxes` — salles VR (`box_nom`, `vr_type`: filaire ou sans_fil)
- `durees_session` — durées disponibles (`label`, `duree_minutes`, `actif`)
- `config` — config globale (`heure_ouverture`, `heure_fermeture`, `buffer_minutes`, `nb_boxes`)
- `jours_fermeture` — dates de fermeture exceptionnelles
- `periodes_vacances` — périodes de vacances scolaires
- `push_subscriptions` — abonnements Web Push admin

**RPC Supabase :** `get_boxes_disponibles(p_debut, p_fin_blocage, p_vr_type)` — retourne les boxes libres pour un créneau (`box_id`, `box_nom` uniquement). Doit être `SECURITY DEFINER` : sans lecture anon de `reservations`, une version `SECURITY INVOKER` ne verrait aucune réservation et annoncerait toutes les box libres

### Données personnelles et RLS

La clé anon est publique (intégrée au JS du site) : **aucune table contenant des données personnelles ne doit être lisible en anon**.
- `reservations`, `reservation_boxes`, `clients` : aucune policy SELECT anon (`supabase/rls_reservations_privees.sql`, **appliqué en prod le 27/09/2026**, vérifié par HTTP avec la clé anon : `[]` sur ces tables et sur `vue_reservations`). Policies `anon_insert` conservées sur `reservations` et `reservation_boxes` (formulaires publics)
- L'analyseur de sécurité Supabase signale `get_boxes_disponibles` (`SECURITY DEFINER` exécutable par anon) et `clients` (RLS sans policy) : **voulu**, ne pas « corriger »
- Lectures admin : `src/lib/admin-read.js` (`adminRead(action, params)` → `{ data, error }`, `fetchClientSuggestions`) → `POST /api/admin/db` → `netlify/lib/admin-reads.ts` (session admin vérifiée, service role, requêtes fixes, paramètres validés). Actions : `list_reservations {start, end, active_only?}` (62 jours max), `client_suggestions {field: nom|email|telephone, value}`, `list_clients`, `client_reservations {client_id}`, `marketing_reservations`
- Côté serveur, toute lecture de ces tables utilise la service role (y compris `getReservationCount` de `mailjet-contacts.ts`)
- Vue `vue_reservations` : `security_invoker=true` (suit la RLS des tables), à garder ainsi
- Ne jamais réintroduire `.select()` après un insert anon, ni une lecture de `reservations` / `clients` avec `src/lib/supabase.js`

### Modification et annulation par le client

**Liens dans l'email de confirmation** (`reservation-confirmation.mts`) : boutons « Modifier » / « Annuler » ajoutés seulement si l'`id` de la réservation est transmis **et** que le créneau commence dans ≥ 24h (`hasMinNotice()` de `netlify/lib/reservation-notice.ts`, partagé par `reservation-confirmation`, `reservation-lookup-public` et `reservation-cancel-public`). Sinon, phrase invitant à appeler le café.
- Annuler : `/reservation/annulation?id=<uuid>&token=<token>` — Modifier : même lien + `&action=modifier`.
- `token` = HMAC-SHA256 de l'id signé avec `ADMIN_PASSWORD` (`netlify/lib/reservation-token.ts`, comparaison en temps constant). Pas d'expiration ; changer `ADMIN_PASSWORD` invalide tous les liens déjà envoyés.
- Mailjet réécrit les liens (suivi des clics `*.mjt.lu/lnk/...`) : l'URL réelle est le dernier segment, encodé en base64 URL-safe.

**Page `/reservation/annulation`** (statique, tout côté client) : charge la réservation via `GET /api/reservation-lookup-public` puis affiche un état parmi `invalid` (token/réservation introuvable), `cancelled` (déjà annulée), `too-late` (< 24h), `confirm`, `success`.

**Annulation simple** : bouton « Confirmer l'annulation » → `POST /api/reservation-cancel-public {id, token}` (revérifie token + 24h, passe `statut` à `annulée`) → email admin `[Annulation]` + email client « Annulation de votre réservation » (`netlify/lib/reservation-emails.ts`).

**Modification — l'ancienne réservation n'est annulée qu'après création de la nouvelle** (le client ne perd jamais son créneau s'il abandonne) :
1. `action=modifier` : la page n'annule rien, bouton « Choisir un nouveau créneau » → redirige, selon `type_reservation` (renvoyé par `reservation-lookup-public`), vers `/reservation` (standard) ou `/reservation-anniversaire` (anniversaire), avec `?nom=&email=&telephone=&remplace=<id>&token=<token>`. **MDJ** : pas de formulaire public → écran `modif-phone` (« appelez-nous » + lien vers l'annulation simple), et l'email de confirmation MDJ n'a que le bouton « Annuler ».
2. `ReservationForm` / `ReservationFormAnniversaire` (mode client) vérifient le lien via `reservation-lookup-public` ; si valide, annulable **et du bon type** (standard pour l'un, anniversaire pour l'autre), affichent le bandeau `#replace-note` (« Vous modifiez votre réservation #REF du … ») et mémorisent `replacing`. Sinon → formulaire normal, sans remplacement.
3. À la soumission : insert `reservations` + `reservation_boxes`, **puis** `POST /api/reservation-cancel-public {id, token, motif: "modification"}` sur l'ancienne. Écran de confirmation : « ancienne réservation #REF annulée » ou, en cas d'échec, invitation à appeler.
4. `motif: "modification"` → `reservation-cancel-public` n'envoie **aucun** email. Le formulaire envoie `remplace_id` à `/api/reservation-confirmation`, qui relit l'ancienne en base (service role) et envoie : au client la confirmation avec « Elle remplace votre réservation #REF » ; à l'admin **un seul** email `[Modification] Nom · jour · 14:00 → 17:00` (ancien créneau barré, alerte si l'ancienne est encore active).

**Limites connues** : pendant le choix du nouveau créneau, l'ancienne réservation occupe encore ses boxes (un créneau qui la chevauche peut apparaître indisponible). Les annulations faites depuis l'admin (`/api/reservation-annulation`) n'envoient pas d'email au client.

### Section admin

Protégée par `src/middleware.ts` (cookie `admin_session` httpOnly, `sameSite: strict`, 30j).

**Session admin** (`netlify/lib/admin-session.ts`, partagé par le middleware, `/admin/login` et les fonctions `admin-avis`, `admin-chat`, `admin-db`, `push-subscribe`, `reservation-annulation` via `isAdminRequest(req)`) :
- Le cookie contient un **jeton signé**, jamais le mot de passe : `v1.<émis_le>.<expire_le>.<HMAC-SHA256 base64url>` (secondes), vérifié par `crypto.subtle.verify` (temps constant) ; mot de passe saisi comparé en temps constant (`checkAdminPassword`)
- Clé = HMAC(`ADMIN_SESSION_SECRET`, à défaut `ADMIN_PASSWORD` ; libellé + `ADMIN_PASSWORD`) → changer **l'une ou l'autre** variable déconnecte toutes les sessions. Sans `ADMIN_PASSWORD` : aucune session acceptée
- Côté Astro, les variables sont lues via `getSecret()` d'`astro:env/server` (`src/lib/admin-env.ts`), **jamais `import.meta.env`** pour un secret : Vite en inlinerait la valeur en clair dans le bundle serveur au build
- ⚠️ Les fonctions Netlify doivent faire `if (!(await isAdminRequest(req)))` — sans `await`, la Promise est toujours « vraie » et l'auth saute
- **État en production** : `ADMIN_SESSION_SECRET` est défini sur Netlify depuis le 27/09/2026 (valeur aléatoire de 64 caractères, marquée **secret**, contexte **production** uniquement : Netlify refuse une variable secrète pour tous les contextes). Personne ne connaît sa valeur, et il n'y a pas besoin de la connaître. Les aperçus de déploiement et le dev local ne l'ont pas → repli sur `ADMIN_PASSWORD` (prévu par le code)
- **Déconnexion** : bouton « Déconnexion » dans le header admin (icône seule sur mobile). Le bouton désabonne d'abord l'appareil des notifications push (détail sous la liste des pages admin), puis envoie `POST /admin/logout` (`src/pages/admin/logout.ts`) qui efface le cookie de **cet appareil** et renvoie vers `/admin/login`. En POST uniquement : un simple lien (GET) ne déconnecte pas (testé en production le 27/09/2026)
- Le jeton étant sans état, un cookie copié reste valable jusqu'à son expiration même après déconnexion. Pour déconnecter **tous** les appareils (appareil perdu, départ d'un employé) : remplacer `ADMIN_SESSION_SECRET` sur Netlify par une nouvelle valeur aléatoire (`netlify env:set ADMIN_SESSION_SECRET "$(openssl rand -base64 48)" --secret --context production --force`) puis redéployer (un redéploiement est nécessaire pour toute modification de variable). Changer `ADMIN_PASSWORD` fonctionne aussi mais invalide en plus tous les liens d'annulation/modification déjà envoyés aux clients
- Historique : jusqu'au 27/09/2026 le cookie contenait le mot de passe en clair ; le passage au jeton signé a déconnecté toutes les sessions (reconnexion nécessaire sur chaque appareil, y compris pour les notifications push admin)

- `/admin/reservations` — tableau des réservations du jour (filtré par date) + stats du jour (total, confirmées, annulées, joueurs, CA). **CA** = somme, sur les réservations `confirmée` uniquement, de `calcMontantReservation(type_reservation, duree_minutes, nb_personnes, prixAnniversaire)` : anniversaire = prix Sanity × joueurs, standard/MDJ = grille `calcMontant`. Le prix anniversaire est lu dans Sanity au rendu SSR de la page (repli 25 €) et transmis au script via l'attribut `data-prix-anniversaire` du `<main>`. Les annulées et no-show ne comptent pas ; c'est un CA théorique (tarifs), pas un encaissement réel.
- `/admin/planning` — vue planning semaine/jour avec état des boxes + gestion vacances/jours fermés
- `/admin/reservation` — nouvelle réservation (même `ReservationForm` en mode `"admin"`, avec autocomplete client)
  - **Voulu** (commit `564e138`, confirmé le 27/09/2026) : en mode admin, le `DatePicker` accepte **tous les jours futurs**, y compris les jours fermés (`jours_fermeture`) et hors planning habituel ; les jours normalement fermés sont affichés **en ambre** (exception signalée, pas bloquée). Ne pas « corriger » (`DatePicker.astro`, `adminMode`)
- `/admin/clients` — CRM : liste clients filtrée (fidèles, inactifs, tous) + historique des réservations
- `/admin/marketing` — stats (fidèles, inactifs, nouveaux) + liens vers Mailjet
- `/admin/aide` — chat d'aide opérationnelle pour les collaborateurs (questions suggérées + saisie libre), répond uniquement à partir de `content/staff-guide.md` via Claude Haiku 4.5
- `/admin/login` — connexion (seule page admin accessible sans session) ; `/admin/logout` — déconnexion de l'appareil, en `POST` uniquement (bouton « Déconnexion » du header)

`AdminLayout.astro` enregistre le service worker et demande la permission push à chaque chargement de page admin, puis renvoie l'abonnement à `POST /api/push/subscribe` **même s'il existe déjà** (upsert idempotent : un appareil dont la ligne a disparu de `push_subscriptions` est ré-enregistré). **À la déconnexion**, le bouton désabonne d'abord le navigateur (`subscription.unsubscribe()`), puis supprime la ligne via `DELETE /api/push/subscribe {endpoint}` tant que la session est encore valide, et seulement ensuite envoie `POST /admin/logout`. Si le navigateur refuse le désabonnement, la ligne est gardée ; si la suppression serveur échoue, l'endpoint déjà invalide est purgé au prochain envoi (erreur 410 dans `notify.ts`). Jamais bloquant : au bout de 2 s la déconnexion a lieu quand même. À la reconnexion, l'appareil se réabonne automatiquement.

### Endpoints API (Netlify Functions)

| Endpoint | Authentification | Description |
|----------|-----------------|-------------|
| `POST /api/reservation-confirmation` | CORS origin | Email confirmation client + sync contact Mailjet |
| `POST /api/contact` | CORS + CSRF HMAC-SHA256 | Email formulaire contact via Mailjet |
| `GET /api/contact-token` | — | Jeton CSRF + horodatage pour le formulaire contact (récupéré côté client : `/contact` est statique) |
| `POST /api/push-notify` | `id` d'une réservation créée il y a < 10 min, jamais notifiée | Notification push admin ; texte construit côté serveur depuis la base |
| `POST` / `DELETE /api/push/subscribe` | Cookie `admin_session` | Enregistre (upsert sur `endpoint`) / supprime l'abonnement push de l'appareil dans Supabase (clé service role) |
| `POST /api/admin-db` | Cookie `admin_session` | Multi-actions : lectures réservations/clients (service role), update résa, vacances, fermetures, boxes |
| `POST /api/admin/chat` | Cookie `admin_session` | Chat d'aide opérationnelle (Claude Haiku 4.5), répond à partir de `content/staff-guide.md` compilé au build |
| `POST /api/reservation-annulation` | Cookie `admin_session` | Annulation réservation (admin) |
| `GET /api/reservation-lookup-public` | Token HMAC (`id` + `token`) | Lecture d'une réservation pour la page `/reservation/annulation` et le mode modification |
| `POST /api/reservation-cancel-public` | Token HMAC (`id` + `token`) | Annulation par le client (≥ 24h) ; `motif: "modification"` = sans email |

**CORS origins autorisées :** `https://vr-cafe.fr`, `https://www.vr-cafe.fr`, `http://localhost:4321`

### Notifications push web

- `src/lib/notify.ts` — `notifyNewReservation()` diffuse à tous les abonnements Supabase (`push_subscriptions`), lus avec la clé **service role** (la table est sous RLS sans policy anon : la clé anon n'y lit rien)
- `netlify/lib/reservation-push.ts` — `notifyReservationOnce(id)` : utilisé par `/api/push-notify` (formulaires publics) et le serveur MCP. Marque `reservations.push_notifie_le` par un UPDATE atomique (`WHERE push_notifie_le IS NULL AND created_at > now() - 10 min`) avant d'envoyer → au plus une notification par réservation réelle, texte construit depuis la base (heure de Paris). Colonne ajoutée par `supabase/push_notification.sql`
- Supprime automatiquement les abonnements expirés (réponses HTTP 410/404)
- `public/sw.js` — Service Worker (enregistré par `AdminLayout.astro`)
- Abonnement / désabonnement d'un appareil admin : `POST` / `DELETE /api/push/subscribe` ; réabonnement à chaque page admin, désabonnement au bouton « Déconnexion » (voir « Section admin »)
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
ADMIN_SESSION_SECRET=...        # Signature des sessions admin (optionnel : repli sur ADMIN_PASSWORD)

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
- **Commande de build** : `bun run test && bun run build` (tests unitaires bloquants)
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
- Réservations et clients : jamais lus avec ce client (clé anon) → `adminRead()` de `src/lib/admin-read.js`

**SEO / données structurées (JSON-LD) :**
- Helpers centralisés dans `src/lib/seo.ts` (`businessNode`, `graph`, `breadcrumb`, `service`, `product`, `faqPage`, `itemList`, `gameListSchema`)
- Composant `src/components/JsonLd.astro` pour émettre un bloc `<script type="application/ld+json">`
- Convention : une page émet un `graph([businessNode, breadcrumb([...]), <schéma page>])` ; `businessNode` doit rester dans le `@graph` pour que les `provider`/`brand` `{"@id": ".../#business"}` se résolvent
- `FAQ.astro` émet automatiquement un `FAQPage` dès qu'il affiche des questions
- Image OG (`public/og-image.jpg`, 1200×630) régénérable via `node scripts/gen-og-image.mjs`

**Sécurité :**
- CSRF via HMAC-SHA256 sur le formulaire contact
- Cookie `admin_session` httpOnly + secure sur toutes les routes `/admin/*`, contenant un jeton de session signé (voir « Session admin »)
- Validation CORS origin sur les endpoints API critiques

## Design System (refonte 2026)

Refonte visuelle complète appliquée à **tout le site public** (mergée sur `master`) **et au back-office `/admin/*`** (également mergé sur `master`, voir « Back-office » plus bas).

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

**Back-office `/admin/*` (refonte faite, mergée sur `master`)** :
- `AdminLayout.astro` : fond `surface` + **topbar unifiée persistante** (wordmark « VR Café · Admin » ≥ sm, nav Réservations/Planning/Clients/Marketing avec onglet actif détecté via `Astro.url.pathname`, CTA « + Réserver » brand, liens scrollables sur mobile via `.no-scrollbar`). Le `<slot>` est dans un `<div class="pt-14">` (PAS un `<main>` : chaque page admin a déjà son propre `<main>`). Script service worker / push conservé.
- Pages refaites en palette design system **sobre & dense** (pas de shimmer/reveal/orbs) : `login`, `reservations`, `clients`, `marketing`, `planning`, `reservation`. Stats cards `bg-[var(--color-surface-card)] border-white/10`, champs `bg-white/5 ring-1 ring-white/10 focus:ring-[var(--color-brand-400)]`, modales `bg-black/60 backdrop-blur-sm` + panneau surface-card, spinners `border-t-[var(--color-brand-400)]`.
- **Couleurs sémantiques conservées** (elles portent du sens métier, ne pas “brandifier”) : badges de statut (confirmée vert / annulée rouge / no_show jaune) en `*-500/15` + `text-*-300` + `border-*-500/30` ; types de résa (anniversaire rose, MDJ violet) ; **couleurs inline des blocs du planning** (`statusClass` ligne ~455 : sans-fil vert / filaire>30 bleu / filaire≤30 violet / anniv rose) + la légende correspondante.
- **Logique métier intouchée** : middleware/cookie `admin_session`, scripts Supabase + RPC `get_boxes_disponibles`, `/api/admin/db` (+ `/api/reservation-annulation`), `calcMontant`, DatePicker, autocomplete, auto-refresh planning, layout JS anti-overlap. Seules les classes Tailwind ont changé.
- ⚠️ Tailwind v4 : toujours `var()` dans l'arbitraire (`text-[var(--color-brand-300)]`, jamais `text-[--color-brand-300]`). Les pages admin n'utilisent **pas** `reveal` (back-office = rapidité, pas d'animation au scroll).
- Les formulaires de réservation admin (`ReservationForm` mode admin, MDJ, Anniversaire) étaient déjà au design system — réutilisés tels quels.

## Reste à faire

Fonctionnalités à créer. Des brouillons existaient sur des branches aujourd'hui supprimées ; leur code reste consultable via des **tags locaux uniquement** (non poussés sur GitHub) : `git show <tag> --stat`.

- **Roue de récompense** (`/roue`, façon Riwil) : page publique de tirage + page admin `/admin/roue`, lots gérés dans Sanity (type `lotRoue`, déjà présent dans `vr-cafe-studio`), tirages stockés dans Supabase. Brouillon : tag `archive/roue-recompense`.
- **Prospection** : relances email via Brevo (edge function Supabase `send-prospection`) + page admin `/admin/prospection` pour valider les relances avant envoi. Brouillon : tag `archive/prospection-brevo`.

Sécurité (relevé le 27/09/2026) :

- **Changer `ADMIN_PASSWORD`** (valeur faible, et elle circulait en clair dans l'ancien cookie `admin_session` et dans le bundle serveur). ⚠️ Invalide tous les liens d'annulation/modification déjà envoyés par email (`netlify/lib/reservation-token.ts`) et les sessions admin. La recréer directement en variable **secrète** sur Netlify
- **Secret dédié pour les liens d'annulation et le CSRF contact** : `reservation-token.ts`, `contact-token.mts` et `contact.mts` signent encore avec `ADMIN_PASSWORD`. Passer à une variable dédiée (même contrainte : invalide les liens déjà envoyés), idéalement en même temps que le changement de mot de passe
- **`WEBHOOK_VERIFY_TOKEN`** (webhook WhatsApp, `netlify/functions/whatsapp-webhook.mts`) : valeur facile à deviner, la remplacer par une valeur aléatoire sur Netlify **et** dans la configuration du webhook côté Meta
- ~~Lecture anon de `reservations` et `clients`~~ : corrigé le 27/09/2026 (voir « Données personnelles et RLS »). Les données étaient lisibles publiquement avant cette date. **Décision (27/09/2026) : pas de notification à la CNIL**, choix de Sandro (responsable du traitement)
- `avis_google` reste lisible en anon (avis publics, mais aussi brouillons de réponse) : à passer par l'API admin si besoin
- Variables Netlify (plan gratuit) : une variable non secrète garde obligatoirement les 4 scopes ; une secrète n'accepte pas `post_processing` ; on ne peut pas passer une variable existante en secret, il faut la supprimer puis la recréer
