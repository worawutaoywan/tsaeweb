# TSAE production server

Host: `104.248.152.59`

To clone this project onto a new machine (what is in GitHub vs private DB copy):
see **[MIGRATE.md](./MIGRATE.md)**.

## Reverse proxy and TLS

The server uses **Caddy only** for ports 80 and 443.

- Service: `caddy.service`
- Configuration: `/etc/caddy/Caddyfile`
- TLS: managed automatically by Caddy
- TSAE website: `tsae.asia`, `www.tsae.asia`
- Admin (single system): `https://www.tsae.asia/admin` -> `127.0.0.1:8090`
- Member portal: `https://www.tsae.asia/member/login` -> `127.0.0.1:8090`
- Form/API endpoints: `/api/*` -> `127.0.0.1:8090`

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

## Pages CMS (retired)

Pages CMS (`cms.tsae.asia`) is **retired**. All content and membership admin
lives in the single system at `https://www.tsae.asia/admin`.

Do not start the Pages CMS stack under `/opt/apps/pagescms` unless recovering
historical data. See archive notes in `ops/pagescms/README.md` if needed.
