# CMS content database (JSON)

This folder is the **source of truth for public site content** (hero, news, events, homepage, campaigns, pages).

- Loaded at build time by Astro (`src/loaders/cms.ts`)
- Edited live via `https://www.tsae.asia/admin/cms`
- Synced with production: `./deploy.sh pull-cms` / `./deploy.sh web`

Do not commit `.publish.*` or `.needs_publish` — those are server runtime flags.
