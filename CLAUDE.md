# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VR Cafe website built with Astro 5, using Keystatic CMS for content management. The site is deployed on Netlify with server-side rendering (SSR). French language site (`lang="fr"`).

## Development Commands

All commands use `bun` (v1.3.2) and should be run from the project root:

- **`bun install`** - Install dependencies
- **`bun dev`** - Start development server at `localhost:4321`
- **`bun run build`** - Build production site to `./dist/`
- **`bun run preview`** - Preview production build locally
- **`bun astro check`** - Run Astro type checking

## Architecture

### Framework & Integrations

- **Astro 5** with SSR mode (`output: "server"`)
- **Netlify adapter** with edge middleware enabled (`edgeMiddleware: true`)
- **Keystatic CMS** - Git-based CMS with admin UI at `/keystatic` route
- **Tailwind CSS v4** via Vite plugin
- **Partytown** for third-party script optimization

### Project Structure

```
src/
├── content/             # Keystatic content (Git-managed)
│   ├── games/          # Game entries (*.mdoc with YAML frontmatter)
│   ├── tags/           # Tag entries (*.json)
│   └── editeurs/       # Publisher entries (*.json)
├── lib/
│   └── keystatic-reader.ts  # Keystatic Reader API helpers
├── components/          # Astro components
│   └── LocalPicture.astro   # Optimized local image component
├── layouts/
│   ├── BaseLayout.astro     # Main layout with NavBar, Footer, WhatsApp
│   ├── BaseHead.astro       # SEO and meta tags
│   └── GamesLayout.astro    # Layout for game pages
├── pages/               # File-based routing
│   ├── [...slug].astro  # Dynamic game detail pages (from Keystatic slugs)
│   └── contact/merci.astro  # Contact form confirmation
└── styles/              # Global styles

public/
└── images/
    └── games/          # Game images (*.jpg)

netlify/
└── functions/
    └── contact.mts      # Serverless contact form handler (Mailjet)

keystatic.config.ts     # Keystatic CMS configuration
```

### Key Architectural Patterns

**Keystatic CMS Integration:**
- Content stored in Git at `src/content/` (games, tags, editeurs)
- Schema defined in `keystatic.config.ts` with 3 collections
- Content fetched using Reader API from `src/lib/keystatic-reader.ts`
- Helper functions: `getGameWithRelations(slug)`, `getGamesByTag(tagTitle)`, `getAllGamesWithRelations()`
- Content types:
  - **games** (Markdoc with YAML frontmatter): name, slug, image, imageAlt, youtubeLink, description, tag (reference), tags (array), editeur (reference), players, duration, difficulty (optional 1-5), age
  - **tags** (JSON): title (slug)
  - **editeurs** (JSON): name (slug)

**Image Handling:**
- Local images stored in `public/images/games/` as JPG files
- `LocalPicture.astro` component using Astro's `<Image>` with WebP format
- `CriticalImage.astro` for above-the-fold images
- `LandingImage.astro` for hero sections
- Images optimized at build time by Astro

**Netlify Functions:**
- Contact form at `/api/contact` (POST) — uses Mailjet to send emails
- Uses `Netlify.env.get()` in production, falls back to `process.env` for local dev
- Honeypot anti-spam field (`bot-field`)

**Build Optimization:**
- Custom Vite `manualChunks`: `keystatic` (all Keystatic/admin code) and `video-player`

### Environment Variables

Required in `.env`:
```
MAILJET_API_KEY=...
MAILJET_API_SECRET=...
MAILJET_SENDER_EMAIL=...
```

**Note:** Keystatic content is Git-based and requires no API keys or environment variables for local development.

### Deployment

- **Platform**: Netlify (Node 22, Bun 1.3.2)
- **Build command**: `bun run build`
- **Publish directory**: `dist`
- `.well-known` directory configured for Apple Pay (see `netlify.toml`)

## Coding Patterns

- BaseLayout wraps all pages with NavBar, Footer, and floating WhatsApp button
- Fixed nav height: CSS variable `--navHeight: 8rem`, smooth scrolling with `scroll-padding-top`
- Dark mode enabled by default (`class="dark"` on `<html>`)
- Keystatic queries:
  - Import helper functions from `src/lib/keystatic-reader.ts`
  - Use `getGameWithRelations(slug)` for single game with resolved relations
  - Use `getGamesByTag(tagTitle)` for filtered game lists
  - Use `reader.collections.{collection}.read(slug)` for direct Reader API access
  - Description field is Markdoc content: call `await game.description()` to render
