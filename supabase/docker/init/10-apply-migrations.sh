#!/usr/bin/env sh
set -eu

echo "[db-init] applying migrations from /workspace/migrations ..."

if [ ! -d /workspace/migrations ]; then
  echo "[db-init] migrations directory not found"
  exit 1
fi

for file in /workspace/migrations/*.sql; do
  if [ ! -f "$file" ]; then
    continue
  fi
  echo "[db-init] applying $(basename "$file")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
done

echo "[db-init] migration bootstrap complete"
