// @ts-check
import { defineConfig } from 'astro/config';

import keystatic from '@keystatic/astro';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

import netlify from '@astrojs/netlify';

import partytown from '@astrojs/partytown';

// https://astro.build/config
export default defineConfig({
	integrations: [keystatic(), react(), partytown()],

  vite: {
    plugins: [
      tailwindcss()
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Grouper tout Keystatic ensemble
            if (id.includes('@keystatic/')) {
              return 'keystatic';
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