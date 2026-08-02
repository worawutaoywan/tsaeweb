#!/usr/bin/env bash
#
# TSAE deploy script — matches the real server configuration.
#
#   Web : Astro dist/            -> root@104.248.152.59:/var/www/tsae_web/
#         (Caddy site: tsae.asia www.tsae.asia — see deploy/caddy-tsae.caddy)
#   API : server/registration/   -> root@104.248.152.59:/opt/registration/
#         (docker container: tsae_registration, 127.0.0.1:8090 -> :8000,
#          Caddy proxies https://www.tsae.asia/api/ -> 8090)
#
# Auth:
#   Set TSAE_DEPLOY_PASS to deploy with password auth (needs `sshpass`),
#   otherwise the script falls back to normal SSH key authentication.
#   Override host with TSAE_SSH_HOST (default root@104.248.152.59).
#
# Usage:
#   ./deploy.sh web    # build + upload the static site  (default)
#   ./deploy.sh api    # upload + rebuild the registration API
#   ./deploy.sh all    # both
#
set -euo pipefail
cd "$(dirname "$0")"

SSH_HOST="${TSAE_SSH_HOST:-root@104.248.152.59}"
OLD_HOST="${TSAE_OLD_HOST:-root@167.71.193.109}"
WEB_DEST="/var/www/tsae_web/"
API_DEST="/opt/registration/"
CMS_DEST="/opt/registration/data/cms/"
SSH_OPTS="-o StrictHostKeyChecking=no"

if [ -n "${TSAE_DEPLOY_PASS:-}" ]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "TSAE_DEPLOY_PASS is set but 'sshpass' is not installed (brew install hudochenkov/sshpass/sshpass)." >&2
    exit 1
  fi
  PASS=(sshpass -p "$TSAE_DEPLOY_PASS")
else
  PASS=()
fi

run_ssh()   { "${PASS[@]+"${PASS[@]}"}" ssh $SSH_OPTS "$SSH_HOST" "$@"; }
run_rsync() { "${PASS[@]+"${PASS[@]}"}" rsync -e "ssh $SSH_OPTS" "$@"; }

sync_cms_push() {
  echo "==> Syncing data/cms/ -> ${SSH_HOST}:${CMS_DEST}"
  run_ssh "mkdir -p ${CMS_DEST}"
  run_rsync -az data/cms/ "${SSH_HOST}:${CMS_DEST}"
}

sync_cms_pull() {
  echo "==> Pulling CMS edits from server (if any)..."
  run_ssh "mkdir -p ${CMS_DEST}" 2>/dev/null || true
  run_rsync -az "${SSH_HOST}:${CMS_DEST}" data/cms/ 2>/dev/null || true
}

migrate_uploads() {
  echo "==> Syncing WP uploads to ${SSH_HOST}:/var/www/tsae_web/wp-uploads/"
  run_ssh "mkdir -p /var/www/tsae_web/wp-uploads /var/www/tsae_web/data"

  if run_ssh "rsync -az -e 'ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8' \
      ${OLD_HOST}:/var/www/wp_clean/wp-content/uploads/ \
      /var/www/tsae_web/wp-uploads/" 2>/dev/null; then
    echo "==> SSH rsync from old server OK."
  else
    echo "==> SSH rsync unavailable — falling back to HTTP sync from old.tsae.asia"
    TSAE_INSECURE_SSL=1 python3 scripts/sync-wp-uploads-http.py
    run_rsync -az wp-uploads/ "${SSH_HOST}:/var/www/tsae_web/wp-uploads/"
  fi
  echo "==> Media migration complete."
}

deploy_web() {
  sync_cms_push
  echo "==> Building Astro site..."
  npm run build
  echo "==> Uploading dist/ -> ${SSH_HOST}:${WEB_DEST}"
  # Preserve wp-uploads/ on the server — it is not part of dist/ but news images depend on it.
  run_rsync -az --delete --exclude 'wp-uploads/' dist/ "${SSH_HOST}:${WEB_DEST}"
  if [ -d wp-uploads ] && [ -n "$(ls -A wp-uploads 2>/dev/null)" ]; then
    echo "==> Syncing wp-uploads/ -> ${SSH_HOST}:${WEB_DEST}wp-uploads/"
    run_rsync -az wp-uploads/ "${SSH_HOST}:${WEB_DEST}wp-uploads/"
  fi
  echo "==> Web deploy complete: https://www.tsae.asia/"
}

deploy_api() {
  echo "==> Uploading server/registration/ -> ${SSH_HOST}:${API_DEST}"
  echo "    (preserving server-side .env and data/)"
  run_rsync -az \
    --exclude '.env' \
    --exclude 'data/' \
    --exclude '__pycache__/' \
    server/registration/ "${SSH_HOST}:${API_DEST}"
  run_ssh "mkdir -p ${API_DEST}data"
  run_rsync -az server/registration/data/members.json "${SSH_HOST}:${API_DEST}data/members.json" 2>/dev/null || true
  sync_cms_push
  echo "==> Ensuring /uploads/ media directory exists..."
  run_ssh "mkdir -p /var/www/tsae_web/uploads && chown -R 1000:1000 /var/www/tsae_web/uploads 2>/dev/null || true"
  echo "==> Rebuilding & restarting the registration container..."
  run_ssh "cd ${API_DEST} && docker compose up -d --build"
  echo "==> API deploy complete: https://www.tsae.asia/api/admin"
}

case "${1:-web}" in
  web) deploy_web ;;
  api) deploy_api ;;
  all) deploy_web; deploy_api ;;
  uploads) migrate_uploads ;;
  pull-cms) sync_cms_pull ;;
  *) echo "Usage: $0 [web|api|all|uploads|pull-cms]"; exit 1 ;;
esac
