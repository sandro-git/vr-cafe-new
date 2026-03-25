// @ts-check
import { defineConfig } from 'astro/config';

import sanity from '@sanity/astro';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  integrations: [sanity(
    {
      projectId: '0oshw5tf',
      dataset: 'production',
      useCdn: true, // See note on using the CDN
      apiVersion: "2025-01-28", // insert the current date to access the latest version of the API
      studioBasePath: '/studio'
    }), react()],

  vite: {
    plugins: [
      tailwindcss()
    ],
    build: {
      chunkSizeWarningLimit: 8000,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Tout Sanity dans un seul chunk pour éviter les dépendances circulaires
            if (id.includes('@sanity/') || id.includes('sanity/lib') || id.includes('studio-component')) {
              return 'sanity';
            }
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

  build: {
    inlineStylesheets: 'always',
  },

  output: "server",
  adapter: netlify({
    imageCDN: false  // Désactive l'optimisation d'images Netlify en dev
  })
});
