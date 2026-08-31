#!/usr/bin/env bash
# Launch, doctor, or clean up an isolated MSSQL MCP HTTP instance for verification.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
RPC_JS="$SCRIPT_DIR/mcp-rpc.mjs"

STATE_DIR="${VERIFY_STATE_DIR:-/tmp/verify-mssql-mcp/state}"
EVIDENCE_DIR="${VERIFY_EVIDENCE_DIR:-/tmp/verify-mssql-mcp/evidence}"
HOST="${MCP_VERIFY_HTTP_HOST:-127.0.0.1}"
PORT="${MCP_VERIFY_HTTP_PORT:-3334}"
BASE_URL="http://${HOST}:${PORT}/mcp"

PID_FILE="$STATE_DIR/server.pid"
PORT_FILE="$STATE_DIR/port"
BASE_URL_FILE="$STATE_DIR/base_url"
LOG_FILE="$STATE_DIR/server.log"

usage() {
  echo "Usage: verify-ctl.sh launch|doctor|cleanup" >&2
  exit 2
}

ensure_env_file() {
  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  fi
}

run_docker() {
  if docker info >/dev/null 2>&1; then
    "$@"
  elif groups | grep -qw docker; then
    sg docker -c "$*"
  else
    "$@"
  fi
}

list_listen_pids() {
  local port="$1"
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  fi
  if [[ -z "$pids" ]] && command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "${port}/tcp" 2>/dev/null || true)"
  fi
  echo "$pids" | tr -s '[:space:]' '\n' | grep -E '^[0-9]+$' || true
}

read_pid() {
  if [[ -f "$PID_FILE" ]]; then
    tr -d '[:space:]' <"$PID_FILE"
  fi
}

pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

cmd_launch() {
  ensure_env_file
  mkdir -p "$STATE_DIR" "$EVIDENCE_DIR"

  # shellcheck disable=SC1091
  set -a
  source "$ROOT_DIR/.env"
  set +a

  if ! run_docker docker ps --format '{{.Names}}' | grep -qx 'mssql-mcp-dev'; then
    echo "Starting Docker MSSQL via npm run db:up"
    (
      cd "$ROOT_DIR"
      run_docker bash -c "cd '$ROOT_DIR' && npm run db:up"
    )
  else
    echo "mssql-mcp-dev already running"
  fi

  local existing_pid
  existing_pid="$(read_pid)"
  local listen_pids
  listen_pids="$(list_listen_pids "$PORT")"

  if pid_alive "$existing_pid"; then
    if echo "$listen_pids" | grep -qx "$existing_pid"; then
      echo "$BASE_URL" >"$BASE_URL_FILE"
      echo "$PORT" >"$PORT_FILE"
      echo "Reusing MCP HTTP pid $existing_pid on $BASE_URL"
      return 0
    fi
    echo "Stale verify pid $existing_pid does not own port $PORT. Refusing to start." >&2
    echo "Run verify-ctl.sh cleanup after inspecting $LOG_FILE." >&2
    exit 1
  fi

  if [[ -n "$listen_pids" ]]; then
    echo "Port $PORT is already in use by pid(s): $listen_pids" >&2
    echo "This skill will not steal a shared listener. Set MCP_VERIFY_HTTP_PORT to a free port." >&2
    exit 1
  fi

  if [[ ! -f "$ROOT_DIR/dist/index.js" ]]; then
    echo "Building project"
    (cd "$ROOT_DIR" && npm run build)
  fi

  rm -f "$PID_FILE" "$PORT_FILE" "$BASE_URL_FILE"
  : >"$LOG_FILE"

  (
    cd "$ROOT_DIR"
    export MCP_TRANSPORT=http
    export MCP_HTTP_HOST="$HOST"
    export MCP_HTTP_PORT="$PORT"
    export ENABLE_DDL=true
    export READONLY=false
    exec node dist/index.js
  ) >>"$LOG_FILE" 2>&1 &
  local server_pid=$!
  echo "$server_pid" >"$PID_FILE"
  echo "$PORT" >"$PORT_FILE"
  echo "$BASE_URL" >"$BASE_URL_FILE"

  local i
  for ((i = 1; i <= 30; i++)); do
    if ! pid_alive "$server_pid"; then
      echo "MCP server exited early. Log: $LOG_FILE" >&2
      tail -40 "$LOG_FILE" >&2 || true
      rm -f "$PID_FILE"
      exit 1
    fi
    if node "$RPC_JS" --base-url "$BASE_URL" --no-require-success initialize >/dev/null 2>&1; then
      echo "MCP HTTP ready pid $server_pid on $BASE_URL (log: $LOG_FILE)"
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for $BASE_URL. Log: $LOG_FILE" >&2
  tail -40 "$LOG_FILE" >&2 || true
  exit 1
}

cmd_doctor() {
  local failed=0

  if run_docker docker ps --format '{{.Names}}' | grep -qx 'mssql-mcp-dev'; then
    echo "ok container mssql-mcp-dev"
  else
    echo "FAIL container mssql-mcp-dev is not running"
    failed=1
  fi

  local pid
  pid="$(read_pid)"
  if pid_alive "$pid"; then
    echo "ok pid $pid"
  else
    echo "FAIL verify server pid missing or dead (expected $PID_FILE)"
    failed=1
    pid=""
  fi

  local listen_pids
  listen_pids="$(list_listen_pids "$PORT")"
  if [[ -n "$pid" ]] && echo "$listen_pids" | grep -qx "$pid"; then
    echo "ok port $PORT owned by $pid"
  else
    echo "FAIL port $PORT is not owned by verify pid ${pid:-none} (listeners: ${listen_pids:-none})"
    failed=1
  fi

  if [[ ! -f "$ROOT_DIR/dist/index.js" ]]; then
    echo "FAIL dist/index.js is missing; run npm run build"
    failed=1
  else
    echo "ok dist/index.js"
  fi

  mkdir -p "$EVIDENCE_DIR"
  local init_out="$EVIDENCE_DIR/doctor-initialize.json"
  local config_out="$EVIDENCE_DIR/doctor-config.json"

  if node "$RPC_JS" --base-url "$BASE_URL" --out "$init_out" --no-require-success initialize >/dev/null; then
    echo "ok initialize $BASE_URL"
  else
    echo "FAIL initialize against $BASE_URL"
    if [[ -f "$LOG_FILE" ]]; then
      echo "server log: $LOG_FILE"
      tail -20 "$LOG_FILE" || true
    fi
    failed=1
  fi

  if node "$RPC_JS" --base-url "$BASE_URL" --out "$config_out" \
    --contains '"transport": "http"' \
    --contains '"enableDdl": true' \
    --contains 'AppDB' \
    --contains 'ReportingDB' \
    resources/read "mssql://config/server" >/dev/null; then
    echo "ok mssql://config/server transport=http enableDdl=true AppDB,ReportingDB"
  else
    echo "FAIL mssql://config/server did not match expected verify config"
    failed=1
  fi

  if [[ "$failed" -ne 0 ]]; then
    echo "Doctor failed. Do not drive this instance." >&2
    exit 1
  fi

  echo "Doctor passed. Evidence: $init_out $config_out"
}

cmd_cleanup() {
  local pid
  pid="$(read_pid)"
  if pid_alive "$pid"; then
    echo "Stopping MCP HTTP pid $pid"
    kill "$pid" 2>/dev/null || true
    local i
    for ((i = 1; i <= 20; i++)); do
      if ! pid_alive "$pid"; then
        break
      fi
      sleep 0.25
    done
    if pid_alive "$pid"; then
      echo "Pid $pid still alive after SIGTERM. Sending SIGKILL." >&2
      kill -9 "$pid" 2>/dev/null || true
    fi
  elif [[ -n "$pid" ]]; then
    echo "Verify pid $pid already stopped"
  else
    echo "No verify pid file"
  fi

  rm -f "$PID_FILE" "$PORT_FILE" "$BASE_URL_FILE"
  echo "Cleanup removed process state under $STATE_DIR. Evidence kept at $EVIDENCE_DIR"
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    launch) cmd_launch ;;
    doctor) cmd_doctor ;;
    cleanup) cmd_cleanup ;;
    *) usage ;;
  esac
}

main "${1:-}"
