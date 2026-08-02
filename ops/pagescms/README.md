# Pages CMS on-premise

Production URL: `https://cms.tsae.asia`

The service runs as two isolated Docker Compose containers:

- Pages CMS on `127.0.0.1:13003`
- PostgreSQL on a private Docker network only

Caddy terminates HTTPS and proxies the CMS. The website and registration API
remain separate services.

The production server uses Caddy exclusively. Do not install or enable Nginx;
it conflicts with Caddy on ports 80 and 443. See `ops/SERVER.md`.

## Deployment outline

1. Point the `cms.tsae.asia` A record to `104.248.152.59`.
2. Copy this directory to `/opt/apps/pagescms` on the server.
3. Clone the official Pages CMS source into `/opt/apps/pagescms/source` and pin the
   reviewed release.
4. Create `/opt/pagescms/.env` from `.env.example` with generated secrets.
5. Create the dedicated GitHub App with callback, setup and webhook URLs using
   `https://cms.tsae.asia`.
6. Start the stack with `docker compose up -d --build`.
7. Add the supplied Caddy site block and let Caddy issue its TLS certificate.
8. Test GitHub login, repository access, media upload, save, CI and production
   deployment before retiring the hosted Pages CMS login.

Never commit `.env`, GitHub App keys, database dumps or generated secrets.

## Security release gate

Do not start or expose the on-premise application until its production
dependencies pass the security review. On 2026-08-02, the official Pages CMS
2.1.8 lockfile reported a critical Better Auth advisory and multiple high
runtime advisories. `npm audit fix --force` is not an acceptable workaround
because it proposes breaking dependency changes.

Until a patched release is available and tested, continue using the hosted
Pages CMS. The prepared on-premise proxy may return HTTP 502 because the
application is intentionally not running.
