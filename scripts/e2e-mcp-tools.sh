#!/usr/bin/env bash
# Full MCP tool E2E: Docker MSSQL + HTTP server + scripts/e2e-mcp-tools.mjs
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${MCP_HTTP_PORT:-3333}"
HOST="${MCP_HTTP_HOST:-127.0.0.1}"
BASE_URL="http://${HOST}:${PORT}/mcp"
SERVER_PID=""
DOCKER_GROUP=false

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Stopping MCP HTTP server (pid $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

run_docker() {
  if docker info >/dev/null 2>&1; then
    "$@"
  elif groups | grep -qw docker; then
    "$@"
  else
    sg docker -c "$*"
  fi
}

echo "==> Ensuring .env exists"
if [[ ! -f .env ]]; then
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

echo "==> Ensuring Docker MSSQL is up"
if ! run_docker docker ps --format '{{.Names}}' | grep -qx 'mssql-mcp-dev'; then
  run_docker bash -c "cd '$ROOT_DIR' && npm run db:up"
else
  echo "    mssql-mcp-dev already running"
fi

echo "==> Building project"
npm run build >/dev/null

echo "==> Starting MCP HTTP server (ENABLE_DDL=true for DDL tool coverage)"
export MCP_TRANSPORT=http
export MCP_HTTP_HOST="$HOST"
export MCP_HTTP_PORT="$PORT"
export ENABLE_DDL=true

# Stop any prior listener so we control ENABLE_DDL and env.
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti ":${PORT}" | xargs -r kill >/dev/null 2>&1 || true
fi
sleep 1

node dist/index.js >/tmp/mssql-mcp-e2e-server.log 2>&1 &
SERVER_PID=$!
echo "    Server pid $SERVER_PID (log: /tmp/mssql-mcp-e2e-server.log)"

for ((i = 1; i <= 30; i++)); do
  if curl -sf -o /dev/null -H 'Accept: application/json, text/event-stream' \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
    "$BASE_URL" 2>/dev/null; then
    echo "    Server ready (attempt $i)"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "MCP server exited early. Log:" >&2
    tail -40 /tmp/mssql-mcp-e2e-server.log >&2 || true
    exit 1
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo "Timed out waiting for MCP server on $BASE_URL" >&2
    tail -40 /tmp/mssql-mcp-e2e-server.log >&2 || true
    exit 1
  fi
done

echo "==> Running MCP tool E2E harness"
MCP_E2E_BASE_URL="$BASE_URL" node scripts/e2e-mcp-tools.mjs
