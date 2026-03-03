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
      chunkSizeWarningLimit: 8000,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Studio Sanity (lourd) : séparé du client léger
            if (id.includes('@sanity/ui') || id.includes('@sanity/icons') || id.includes('studio-component') || id.includes('sanity/dist/studio')) {
              return 'sanity-studio';
            }
            // Client Sanity utilisé sur les pages publiques
            if (id.includes('@sanity/') || id.includes('sanity/lib')) {
              return 'sanity-core';
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

  output: "server",
  adapter: netlify({
    edgeMiddleware: true,
    imageCDN: false  // Désactive l'optimisation d'images Netlify en dev
  })
});