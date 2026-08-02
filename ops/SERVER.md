# TSAE production server

Host: `104.248.152.59`

## Reverse proxy and TLS

The server uses **Caddy only** for ports 80 and 443.

- Service: `caddy.service`
- Configuration: `/etc/caddy/Caddyfile`
- TLS: managed automatically by Caddy
- TSAE website: `tsae.asia`, `www.tsae.asia`
- TSAE CMS: `cms.tsae.asia` -> `127.0.0.1:13003`
- Registration API: `/api/*` -> `127.0.0.1:8090`

Do not install or enable Nginx on this server. It conflicts with Caddy on ports
80 and 443. Nginx was confirmed inactive and unused, then removed on
2026-08-02. Its final configuration backup is stored at:

`/opt/backups/nginx-config-before-removal-2026-08-02.tar.gz`

Before changing Caddy:

1. Back up `/etc/caddy/Caddyfile`.
2. Run `caddy validate --config /etc/caddy/Caddyfile`.
3. Reload with `systemctl reload caddy`.
4. Verify `https://www.tsae.asia/` and
   `https://www.tsae.asia/api/health` both return HTTP 200.

## Pages CMS

Pages CMS is installed under `/opt/apps/pagescms` and is isolated from the
Astro website and registration API. See `ops/pagescms/README.md` for its
deployment and recovery notes.
