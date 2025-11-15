# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VR Café website built with Astro 5, using Sanity CMS for content management. The site is deployed on Netlify with server-side rendering (SSR).

## Development Commands

All commands use `pnpm` and should be run from the project root:

- **`pnpm install`** - Install dependencies
- **`pnpm dev`** - Start development server at `localhost:4321`
- **`pnpm build`** - Build production site to `./dist/`
- **`pnpm preview`** - Preview production build locally
- **`pnpm astro ...`** - Run Astro CLI commands (e.g., `pnpm astro check`)

## Architecture

### Framework & Integrations

- **Astro 5** with SSR mode (`output: "server"`)
- **Netlify adapter** for deployment
- **Sanity CMS** integration:
  - Project ID: `0oshw5tf`
  - Dataset: `production`
  - Studio accessible at `/studio` route
  - Uses `@sanity/astro` integration with Vision tool
- **React 19** - Required only for Sanity Studio (`/studio`), not used in frontend components
- **Tailwind CSS v4** via Vite plugin
- **Partytown** for third-party script optimization

### Project Structure

```
src/
├── sanity/
│   ├── schemaTypes/     # Sanity content schemas
│   │   ├── games.ts     # Games content type
│   │   ├── tag.ts       # Tag content type
│   │   ├── editeur.ts   # Publisher content type
│   │   └── index.ts     # Schema exports
│   └── lib/
│       ├── load-query.ts    # Sanity query helper
│       └── url-for-image.ts # Image URL builder
├── components/          # Astro/React components
├── layouts/
│   ├── BaseLayout.astro     # Main layout with NavBar, Footer, WhatsApp
│   ├── BaseHead.astro       # SEO and meta tags
│   └── GamesLayout.astro    # Layout for game pages
├── pages/               # File-based routing
│   ├── index.astro
│   ├── [...slug].astro  # Dynamic game detail pages
│   ├── jeux.astro       # Games listing
│   ├── contact.astro
│   ├── reservation.astro
│   └── ...              # Other static pages
├── assets/              # Static assets
└── styles/              # Global styles
```

### Key Architectural Patterns

**Sanity CMS Integration:**
- Content is fetched using `loadQuery()` from `src/sanity/lib/load-query.ts`
- Schema types are defined in `src/sanity/schemaTypes/` and exported via `index.ts`
- Sanity client is configured to use CDN for performance
- All queries use `sanityClient.fetch()` with `filterResponse: false`

**Content Types:**
- **games**: VR game content with slug, image, YouTube links, tags, difficulty, duration, players, age rating
- **tag**: Category/tag system for games
- **editeur**: Game publishers/developers

**Image Handling:**
- Use `SanityPicture.astro` for Sanity-sourced images
- `CriticalImage.astro` for above-the-fold images
- `LandingImage.astro` for hero sections
- All Sanity images support hotspot positioning

**Build Optimization:**
- Custom Vite `manualChunks` configuration splits code into:
  - `sanity-studio` - Sanity Studio (heavy)
  - `sanity-vision` - Vision tool
  - `video-player` - Video components
  - `sanity-utils` - Sanity client utilities

**Routing:**
- Static pages in `src/pages/`
- Dynamic game detail pages via `[...slug].astro` using Sanity slug field
- French language site (`lang="fr"`)

### Environment Variables

Required in `.env`:
```
PUBLIC_SANITY_PROJECT_ID=0oshw5tf
PUBLIC_SANITY_DATASET=production
```

### Deployment

- **Platform**: Netlify
- **Build command**: `pnpm build`
- **Publish directory**: `dist`
- **Special configuration**: `.well-known` directory is configured for Apple Pay and similar services (see `netlify.toml`)

## Coding Patterns

**Astro Components:**
- Use component frontmatter (between `---` fences) for data fetching
- BaseLayout provides NavBar, Footer, and WhatsApp button
- Smooth scrolling is configured with `scroll-padding-top: var(--navHeight)`

**Sanity Queries:**
- Import `loadQuery` from `src/sanity/lib/load-query.ts`
- Use TypeScript generics for type-safe responses: `loadQuery<YourType>({ query, params })`
- Access results via `.data` property

**Layouts:**
- BaseLayout wraps all pages with navigation, footer, and floating WhatsApp button
- Fixed navigation height defined as CSS variable `--navHeight: 8rem`
- Dark mode enabled by default (`class="dark"` on `<html>`)
