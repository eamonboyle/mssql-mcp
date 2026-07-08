#!/usr/bin/env bash
# Start the local MSSQL container and apply the idempotent seed.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required. Install Docker, then re-run: npm run db:up" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable. Start dockerd, then re-run: npm run db:up" >&2
  exit 1
fi

# Prefer compose v2 plugin; fall back to docker-compose if present.
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "docker compose is required." >&2
    exit 1
  fi
}

# Load optional local overrides without requiring dotenv tooling.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export MSSQL_SA_PASSWORD="${MSSQL_SA_PASSWORD:-${DB_PASSWORD:-Str0ng!Passw0rd}}"
export MSSQL_HOST_PORT="${MSSQL_HOST_PORT:-1433}"

# Replace a leftover ad-hoc container from earlier manual setup if present.
if docker ps -a --format '{{.Names}}' | grep -qx 'mssql-dev'; then
  echo "Removing legacy container mssql-dev..."
  docker rm -f mssql-dev >/dev/null
fi

echo "Starting mssql-mcp-dev..."
compose up -d mssql

echo "Waiting for SQL Server to accept connections..."
"$ROOT_DIR/scripts/mssql-wait.sh"

echo "Applying seed..."
"$ROOT_DIR/scripts/mssql-seed.sh"

cat <<EOF

MSSQL is ready.
  Host:     localhost:${MSSQL_HOST_PORT}
  User:     sa
  Password: (MSSQL_SA_PASSWORD / DB_PASSWORD)
  DBs:      AppDB, ReportingDB

Copy .env.example -> .env (or export the vars), then:
  npm start
  # or HTTP: MCP_TRANSPORT=http npm start
EOF
