// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import pagefind from 'astro-pagefind';
import sitemap from '@astrojs/sitemap';
import { syncCampaignAssetsToPublic } from './src/loaders/campaigns.ts';

syncCampaignAssetsToPublic();

export default defineConfig({
  vite: {
    plugins: [
      tailwindcss(),
      {
        name: 'tsae-sync-campaign-assets',
        buildStart() {
          syncCampaignAssetsToPublic();
        },
      },
    ],
  },
  integrations: [pagefind(), sitemap()],
  output: 'static',
  site: 'https://www.tsae.asia',
  redirects: {
    '/about/advisors': '/about',
    '/th/about/advisors': '/th/about',
    '/events/conf27-creative-thinking-2569': '/events/conf27-national-speakers-2569',
    '/th/events/conf27-creative-thinking-2569': '/th/events/conf27-national-speakers-2569',
    '/iaec2026': '/c/iaec2026',
    '/iaec2026/': '/c/iaec2026/',
  },
});
