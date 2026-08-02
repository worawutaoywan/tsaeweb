#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ -e .env ]; then
  echo ".env already exists; leaving it unchanged"
  exit 0
fi

umask 077
postgres_password="$(openssl rand -hex 32)"
better_auth_secret="$(openssl rand -base64 32)"
crypto_key="$(openssl rand -base64 32)"

{
  printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
  printf 'BETTER_AUTH_SECRET=%s\n' "$better_auth_secret"
  printf 'CRYPTO_KEY=%s\n' "$crypto_key"
  printf 'BASE_URL=https://cms.tsae.asia\n'
  printf 'ADMIN_EMAILS=worawutaoywan@gmail.com\n'
} > .env

chmod 600 .env
echo "Created protected base environment at $(pwd)/.env"
