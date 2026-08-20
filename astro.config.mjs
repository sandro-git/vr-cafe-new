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
    filter: (page) =>
      !page.includes('/admin/') &&
      !page.includes('/contact/merci') &&
      !page.includes('/cadeaux') &&
      !page.includes('/giftCard'),
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

  // Pages prérendues en fichiers plats (page.html) plutôt qu'en dossiers (page/index.html) :
  // le site n'utilise jamais de slash final dans ses liens internes et ses redirections
  // (voir netlify.toml), mais le format "directory" par défaut fait que Netlify sert ces
  // pages sous /page/ et redirige automatiquement /page -> /page/ (301 caché sur ~48 URLs,
  // cf. Search Console "Page avec redirection"). Le format "file" élimine cette redirection
  // implicite à la source, sans règle de redirection custom (voir commit d808bad : une règle
  // générique /:path/ -> /:path avait provoqué une boucle infinie en combinaison avec ce
  // comportement de Netlify).
  build: {
    format: "file",
  },

  output: "server",
  adapter: netlify({
    imageCDN: false  // Désactive l'optimisation d'images Netlify en dev
  }),

  devToolbar: {
    enabled: false  // Cache la barre debug Astro (gêne sur mobile)
  }
});