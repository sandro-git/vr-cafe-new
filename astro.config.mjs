// @ts-check
import { defineConfig } from 'astro/config';

import sanity from '@sanity/astro';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity(
      {
        projectId: '0oshw5tf',
        dataset: 'production',
        useCdn: true, // See note on using the CDN
        apiVersion: "2025-01-28", // insert the current date to access the latest version of the API
        studioBasePath: '/studio' // If you want to access the Studio on a route

      }),
    react()
  ],

  vite: {
    plugins: [tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Séparer Sanity Studio (très lourd)
            if (id.includes('@sanity/astro') || id.includes('sanity/lib') || id.includes('studio-component')) {
              return 'sanity-studio';
            }
            // Séparer Sanity Vision
            if (id.includes('@sanity/vision') || id.includes('SanityVision')) {
              return 'sanity-vision';
            }
            // Séparer VideoPlayer
            if (id.includes('VideoPlayer') || id.includes('video-player')) {
              return 'video-player';
            }
            // Grouper React
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            // Grouper les utilitaires Sanity
            if (id.includes('@sanity/client') || id.includes('@sanity/image-url')) {
              return 'sanity-utils';
            }
            // Grouper styled-components
            if (id.includes('styled-components')) {
              return 'styled-components';
            }
          }
        }
      }
    }
  },

  output: "server",
  adapter: netlify()
});