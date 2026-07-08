#!/usr/bin/env bash
# Block until the mssql-mcp-dev container accepts SQL connections.
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
RETRIES="${MSSQL_WAIT_RETRIES:-60}"
SLEEP_SECS="${MSSQL_WAIT_SLEEP_SECS:-2}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container $CONTAINER is not running." >&2
  exit 1
fi

# Prefer tools18 (2022 image); fall back to tools if present.
sqlcmd_bin() {
  if docker exec "$CONTAINER" test -x /opt/mssql-tools18/bin/sqlcmd; then
    echo /opt/mssql-tools18/bin/sqlcmd
  elif docker exec "$CONTAINER" test -x /opt/mssql-tools/bin/sqlcmd; then
    echo /opt/mssql-tools/bin/sqlcmd
  else
    echo "sqlcmd not found inside $CONTAINER" >&2
    exit 1
  fi
}

SQLCMD="$(sqlcmd_bin)"

for ((i = 1; i <= RETRIES; i++)); do
  if docker exec "$CONTAINER" "$SQLCMD" -S localhost -U sa -P "$PASSWORD" -C -Q "SELECT 1" >/dev/null 2>&1; then
    echo "SQL Server is accepting connections (attempt $i)."
    exit 0
  fi
  sleep "$SLEEP_SECS"
done

echo "Timed out waiting for SQL Server in $CONTAINER." >&2
docker logs --tail 40 "$CONTAINER" >&2 || true
exit 1
