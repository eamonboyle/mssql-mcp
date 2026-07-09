#!/usr/bin/env bash
# Stop the local MSSQL stack. Pass --volumes to also wipe the data volume.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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

if [[ "${1:-}" == "--volumes" || "${1:-}" == "-v" ]]; then
  compose down -v
  echo "Stopped mssql and removed volumes."
else
  compose down
  echo "Stopped mssql (data volume retained). Use npm run db:reset to wipe data."
fi
