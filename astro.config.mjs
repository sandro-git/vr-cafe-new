// @ts-check
import { defineConfig } from 'astro/config';

import sanity from '@sanity/astro';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

import netlify from '@astrojs/netlify';


// https://astro.build/config
export default defineConfig({
  site: 'https://vr-cafe.fr',

  // Astro 7 : le défaut est passé à `'jsx'` (espaces retirés entre éléments inline),
  // ce qui collait les mots stylés (`text-shimmer`/`highlight`) à leur texte voisin
  // dans les titres. On conserve le comportement v6 sur tout le site.
  compressHTML: true,
  integrations: [sanity(
    {
      projectId: '0oshw5tf',
      dataset: 'production',
      useCdn: import.meta.env.PROD,
      apiVersion: "2025-01-28",
    }), sitemap({
    filter: (page) => !page.includes('/admin/') && !page.includes('/contact/merci'),
  })],

  vite: {
    plugins: [
      tailwindcss()
    ],
    server: {
      host: true
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('VideoPlayer') || id.includes('video-player')) {
              return 'video-player';
            }
          }
        }
      }
    }
  },

  image: {
    domains: ['cdn.sanity.io'],
  },

  output: "server",
  adapter: netlify({
    imageCDN: false  // Désactive l'optimisation d'images Netlify en dev
  }),

  devToolbar: {
    enabled: false  // Cache la barre debug Astro (gêne sur mobile)
  }
});