#!/usr/bin/env bash
# Apply docker/mssql/init/*.sql into the running mssql-mcp-dev container (idempotent).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PASSWORD="${MSSQL_SA_PASSWORD:-${DB_PASSWORD:-Str0ng!Passw0rd}}"
CONTAINER="${MSSQL_CONTAINER_NAME:-mssql-mcp-dev}"
INIT_DIR="$ROOT_DIR/docker/mssql/init"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container $CONTAINER is not running. Run: npm run db:up" >&2
  exit 1
fi

if docker exec "$CONTAINER" test -x /opt/mssql-tools18/bin/sqlcmd; then
  SQLCMD=/opt/mssql-tools18/bin/sqlcmd
elif docker exec "$CONTAINER" test -x /opt/mssql-tools/bin/sqlcmd; then
  SQLCMD=/opt/mssql-tools/bin/sqlcmd
else
  echo "sqlcmd not found inside $CONTAINER" >&2
  exit 1
fi

shopt -s nullglob
files=("$INIT_DIR"/*.sql)
if ((${#files[@]} == 0)); then
  echo "No .sql files found in $INIT_DIR" >&2
  exit 1
fi

for file in "${files[@]}"; do
  base="$(basename "$file")"
  echo "Applying $base..."
  # Copy into the container so we do not depend on the bind-mount path layout.
  # mssql image runs as non-root; /tmp may not be deletable — ignore cleanup failures.
  docker cp "$file" "$CONTAINER:/tmp/$base"
  docker exec "$CONTAINER" "$SQLCMD" -S localhost -U sa -P "$PASSWORD" -C -i "/tmp/$base"
  docker exec "$CONTAINER" rm -f "/tmp/$base" >/dev/null 2>&1 || true
done

echo "Seed applied."
