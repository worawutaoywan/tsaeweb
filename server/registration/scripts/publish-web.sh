#!/usr/bin/env bash
# Rebuild Astro site on the server from live CMS JSON and publish to Caddy web root.
# Triggered by systemd path unit when CMS touches .needs_publish
set -euo pipefail

SITE="${TSAE_SITE_DIR:-/opt/tsae-web}"
CMS_SRC="${TSAE_CMS_DIR:-/opt/registration/data/cms}"
WEB_DEST="${TSAE_WEB_DEST:-/var/www/tsae_web}"
FLAG="${CMS_SRC}/.needs_publish"
LOCK="${CMS_SRC}/.publish.lock"
LOG="${CMS_SRC}/.publish.log"
STATUS="${CMS_SRC}/.publish.status"

log() { echo "[$(date -Is)] $*" | tee -a "$LOG"; }

fail() {
  echo "error" >"$STATUS"
  log "ERROR: $*"
  exit 1
}

mkdir -p "$CMS_SRC" "$SITE" "$WEB_DEST"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "busy" >"$STATUS"
  log "publish already running — skip"
  exit 0
fi

echo "running" >"$STATUS"
rm -f "$FLAG"
: >"$LOG"
log "publish start"
# If another save happens during this build, .needs_publish will reappear
# and systemd path will run us again — do not wipe that flag at the end.

trap 'echo error >"$STATUS"; log "publish failed (exit $?)"; exit 1' ERR

if [[ ! -f "$SITE/package.json" ]]; then
  fail "$SITE/package.json missing — run ./deploy.sh api once to sync site source"
fi

# Sync CMS content into the site tree used for build
mkdir -p "$SITE/data/cms"
rsync -a --delete \
  --exclude '.needs_publish' \
  --exclude '.publish.lock' \
  --exclude '.publish.log' \
  --exclude '.publish.status' \
  --exclude '.publish.pid' \
  "$CMS_SRC/" "$SITE/data/cms/"

# Prefer live media from the public web root (avoid stale/missing public/ copies)
mkdir -p "$SITE/public"
for name in images wp-uploads downloads uploads; do
  if [[ -d "$WEB_DEST/$name" ]]; then
    rm -rf "$SITE/public/$name"
    ln -sfn "$WEB_DEST/$name" "$SITE/public/$name"
  fi
done

cd "$SITE"
# Install with devDependencies — astro-pagefind is required by astro.config.mjs
unset NODE_ENV
if [[ ! -d node_modules ]]; then
  log "npm install (first run)"
  npm install --no-audit --no-fund --include=dev
else
  log "npm install (refresh)"
  npm install --no-audit --no-fund --include=dev >/dev/null
fi

export NODE_ENV=production
export ASTRO_TELEMETRY_DISABLED=1
log "astro build"
npm run build

log "rsync dist -> $WEB_DEST"
rsync -a --delete \
  --exclude 'wp-uploads/' \
  --exclude 'uploads/' \
  "$SITE/dist/" "$WEB_DEST/"

# Keep media dirs if somehow removed
mkdir -p "$WEB_DEST/uploads" "$WEB_DEST/wp-uploads"

trap - ERR

if [[ -f "$FLAG" ]]; then
  echo "queued" >"$STATUS"
  log "publish complete — another change queued, will rebuild"
else
  echo "ok" >"$STATUS"
  log "publish complete"
fi
