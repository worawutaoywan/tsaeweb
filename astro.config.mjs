// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import pagefind from 'astro-pagefind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [pagefind(), sitemap()],
  output: 'static',
  site: 'https://www.tsae.asia',
  redirects: {
    '/about/advisors': '/about',
    '/th/about/advisors': '/th/about',
  },
});