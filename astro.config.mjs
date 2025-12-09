// @ts-check
import { defineConfig } from 'astro/config';

import sanity from '@sanity/astro';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

import netlify from '@astrojs/netlify';

import partytown from '@astrojs/partytown';

// https://astro.build/config
export default defineConfig({
  integrations: [sanity(
    {
      projectId: '0oshw5tf',
      dataset: 'production',
      useCdn: true, // See note on using the CDN
      apiVersion: "2025-01-28", // insert the current date to access the latest version of the API
      studioBasePath: '/studio'
    }), react(), partytown()],

  vite: {
    plugins: [
      tailwindcss()
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Grouper tout Sanity ensemble pour éviter les problèmes de dépendances circulaires
            if (id.includes('@sanity/') || id.includes('sanity/lib') || id.includes('studio-component')) {
              return 'sanity';
            }
            // Séparer VideoPlayer
            if (id.includes('VideoPlayer') || id.includes('video-player')) {
              return 'video-player';
            }
          }
        }
      }
    }
  },

  output: "server",
  adapter: netlify({
    edgeMiddleware: true,
    imageCDN: false  // Désactive l'optimisation d'images Netlify en dev
  })
});