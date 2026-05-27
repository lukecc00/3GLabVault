#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/storage/dev"
LOG_DIR="$RUNTIME_DIR/logs"
SERVER_PID_FILE="$RUNTIME_DIR/server.pid"
WEB_PID_FILE="$RUNTIME_DIR/web.pid"
SERVER_LOG_FILE="$LOG_DIR/server.log"
WEB_LOG_FILE="$LOG_DIR/web.log"
DOCKER_COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ROOT_ENV_FILE="$ROOT_DIR/.env"
SERVER_ENV_FILE="$ROOT_DIR/apps/server/.env"

mkdir -p "$LOG_DIR"

print_header() {
  printf '\n[%s] %s\n' "3GLabVault" "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

load_root_env() {
  if [[ -f "$ROOT_ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ROOT_ENV_FILE"
    set +a
  fi
}

configured_value() {
  local value="${1:-}"
  local fallback="$2"

  if [[ -n "$value" ]]; then
    printf '%s' "$value"
  else
    printf '%s' "$fallback"
  fi
}

build_base_url() {
  local protocol="$1"
  local host="$2"
  local port="$3"

  if [[ -n "$port" ]]; then
    printf '%s://%s:%s' "$protocol" "$host" "$port"
  else
    printf '%s://%s' "$protocol" "$host"
  fi
}

probe_http_host() {
  local host="$1"

  case "$host" in
    0.0.0.0)
      printf '127.0.0.1'
      ;;
    ::|::0|[::]|::1)
      printf '127.0.0.1'
      ;;
    *)
      printf '%s' "$host"
      ;;
  esac
}

init_runtime_config() {
  local server_minio_api_port=""
  load_root_env
  WEB_PROTOCOL="$(configured_value "${WEB_PROTOCOL:-}" "http")"
  SERVER_PROTOCOL="$(configured_value "${SERVER_PROTOCOL:-}" "http")"
  WEB_HOST="$(configured_value "${WEB_HOST:-}" "localhost")"
  WEB_PORT="$(configured_value "${WEB_PORT:-}" "3000")"
  SERVER_HOST="$(configured_value "${SERVER_HOST:-}" "localhost")"
  SERVER_PORT="$(configured_value "${SERVER_PORT:-}" "3001")"
  REDIS_PORT="$(configured_value "${REDIS_PORT:-}" "6379")"
  WEB_BASE_URL="$(build_base_url "$WEB_PROTOCOL" "$WEB_HOST" "$WEB_PORT")"
  SERVER_BASE_URL="$(build_base_url "$SERVER_PROTOCOL" "$SERVER_HOST" "$SERVER_PORT")"
  API_BASE_URL="$SERVER_BASE_URL/api"
  WEB_LOGIN_URL="$WEB_BASE_URL/login"
  SERVER_READY_URL="$(build_base_url "$SERVER_PROTOCOL" "$(probe_http_host "$SERVER_HOST")" "$SERVER_PORT")/api"
  WEB_READY_URL="$(build_base_url "$WEB_PROTOCOL" "$(probe_http_host "$WEB_HOST")" "$WEB_PORT")/login"
  server_minio_api_port="$(read_env_value "$SERVER_ENV_FILE" "MINIO_PORT")"
  MINIO_API_PORT="${server_minio_api_port:-}"
  MINIO_CONSOLE_PORT=""

  if [[ -n "$MINIO_API_PORT" ]]; then
    MINIO_CONSOLE_PORT="$((MINIO_API_PORT + 1))"
  fi
}

ensure_server_env() {
  local example_file="$ROOT_DIR/apps/server/.env.example"

  if [[ ! -f "$SERVER_ENV_FILE" ]]; then
    cp "$example_file" "$SERVER_ENV_FILE"
    echo "Created apps/server/.env from .env.example"
  fi
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"

  python3 - "$file" "$key" "$value" <<'PY'
from pathlib import Path
import re
import sys

file_path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
content = file_path.read_text() if file_path.exists() else ""
pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
line = f"{key}={value}"

if pattern.search(content):
    content = pattern.sub(line, content)
else:
    content = f"{content.rstrip()}\n{line}\n" if content.strip() else f"{line}\n"

file_path.write_text(content)
PY
}

read_env_value() {
  local file="$1"
  local key="$2"

  python3 - "$file" "$key" <<'PY'
from pathlib import Path
import sys

file_path = Path(sys.argv[1])
key = sys.argv[2]

if not file_path.exists():
    raise SystemExit(0)

for line in file_path.read_text().splitlines():
    if not line or line.lstrip().startswith("#") or "=" not in line:
        continue
    current_key, value = line.split("=", 1)
    if current_key.strip() == key:
        print(value.strip())
        break
PY
}

read_pid_file() {
  local pid_file="$1"

  if [[ -f "$pid_file" ]]; then
    tr -d '[:space:]' <"$pid_file"
  fi
}

is_pid_running() {
  local pid_file="$1"
  local pid

  pid="$(read_pid_file "$pid_file")"
  [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null
}

port_is_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

pick_available_port() {
  for candidate in "$@"; do
    if ! port_is_listening "$candidate"; then
      printf '%s' "$candidate"
      return 0
    fi
  done

  echo "Unable to find a free port from candidates: $*" >&2
  exit 1
}

configure_infra_ports() {
  MINIO_API_PORT="$(pick_available_port 9000 9010 9020 9030)"
  MINIO_CONSOLE_PORT="$(pick_available_port 9001 9011 9021 9031)"

  if [[ "$MINIO_CONSOLE_PORT" == "$MINIO_API_PORT" ]]; then
    MINIO_CONSOLE_PORT="$(pick_available_port 9011 9021 9031 9041)"
  fi

  set_env_value "$SERVER_ENV_FILE" "MINIO_ENDPOINT" "$(probe_http_host "$SERVER_HOST")"
  set_env_value "$SERVER_ENV_FILE" "MINIO_PORT" "$MINIO_API_PORT"
  set_env_value "$SERVER_ENV_FILE" "REDIS_URL" "redis://$(probe_http_host "$SERVER_HOST"):$REDIS_PORT"
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-40}"
  local sleep_seconds="${3:-1}"
  local attempt=1

  while (( attempt <= attempts )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi

    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
  done

  return 1
}

start_infra() {
  print_header "Starting PostgreSQL / Redis / MinIO containers"
  REDIS_PORT="$REDIS_PORT" \
    MINIO_API_PORT="$MINIO_API_PORT" \
    MINIO_CONSOLE_PORT="$MINIO_CONSOLE_PORT" \
    docker compose -f "$DOCKER_COMPOSE_FILE" up -d postgres redis minio >/dev/null

  local attempt=1
  while (( attempt <= 40 )); do
    if port_is_listening 5432 && port_is_listening "$REDIS_PORT" && port_is_listening "$MINIO_API_PORT"; then
      echo "PostgreSQL is listening on port 5432"
      echo "Redis is listening on port $REDIS_PORT"
      echo "MinIO is listening on port $MINIO_API_PORT"
      return 0
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  echo "Local infrastructure did not start in time" >&2
  exit 1
}

sync_database() {
  print_header "Syncing database schema"
  (cd "$ROOT_DIR/apps/server" && pnpm db:push)

  print_header "Seeding default data"
  (cd "$ROOT_DIR/apps/server" && pnpm db:seed)
}

start_server() {
  if is_pid_running "$SERVER_PID_FILE"; then
    echo "Server already running with PID $(read_pid_file "$SERVER_PID_FILE")"
    return 0
  fi

  if port_is_listening "$SERVER_PORT"; then
    echo "Port $SERVER_PORT is already in use. Assuming API is already running."
    return 0
  fi

  print_header "Building API server"
  (cd "$ROOT_DIR/apps/server" && pnpm build)

  print_header "Starting API server"
  (
    cd "$ROOT_DIR/apps/server" &&
      nohup env \
        HOST="$SERVER_HOST" \
        PORT="$SERVER_PORT" \
        CORS_ORIGIN="${CORS_ORIGIN:-$WEB_BASE_URL}" \
        APP_BASE_URL="${APP_BASE_URL:-$WEB_BASE_URL}" \
        REDIS_URL="redis://$(probe_http_host "$SERVER_HOST"):$REDIS_PORT" \
        MINIO_ENDPOINT="$(probe_http_host "$SERVER_HOST")" \
        MINIO_PORT="$MINIO_API_PORT" \
        WEB_HOST="$WEB_HOST" \
        WEB_PORT="$WEB_PORT" \
        WEB_PROTOCOL="$WEB_PROTOCOL" \
        node scripts/run-local-server.cjs >"$SERVER_LOG_FILE" 2>&1 &
      echo $! >"$SERVER_PID_FILE"
  )

  if ! wait_for_http "$SERVER_READY_URL" 60 1; then
    echo "API server failed to start. Recent log output:" >&2
    tail -n 80 "$SERVER_LOG_FILE" >&2 || true
    exit 1
  fi

  echo "API server is ready on $API_BASE_URL"
}

start_web() {
  if is_pid_running "$WEB_PID_FILE"; then
    echo "Web app already running with PID $(read_pid_file "$WEB_PID_FILE")"
    return 0
  fi

  if port_is_listening "$WEB_PORT"; then
    echo "Port $WEB_PORT is already in use. Assuming web app is already running."
    return 0
  fi

  print_header "Starting web app"
  (
    cd "$ROOT_DIR/apps/web" &&
      nohup env \
        NEXT_PUBLIC_API_BASE_URL="$API_BASE_URL" \
        NEXT_PUBLIC_API_PROTOCOL="$SERVER_PROTOCOL" \
        NEXT_PUBLIC_API_HOST="$SERVER_HOST" \
        NEXT_PUBLIC_API_PORT="$SERVER_PORT" \
        NEXT_PUBLIC_WEB_PORT="$WEB_PORT" \
        pnpm dev --hostname "$WEB_HOST" --port "$WEB_PORT" >"$WEB_LOG_FILE" 2>&1 &
      echo $! >"$WEB_PID_FILE"
  )

  if ! wait_for_http "$WEB_READY_URL" 90 1; then
    echo "Web app failed to start. Recent log output:" >&2
    tail -n 80 "$WEB_LOG_FILE" >&2 || true
    exit 1
  fi

  echo "Web app is ready on $WEB_LOGIN_URL"
}

show_status() {
  print_header "Current status"

  if port_is_listening 5432; then
    echo "postgres : listening on 5432"
  else
    echo "postgres : not listening on 5432"
  fi

  if port_is_listening "$REDIS_PORT"; then
    echo "redis    : listening on $REDIS_PORT"
  else
    echo "redis    : not listening on $REDIS_PORT"
  fi

  if [[ -n "$MINIO_API_PORT" ]] && port_is_listening "$MINIO_API_PORT"; then
    echo "minio    : listening on $MINIO_API_PORT"
  else
    echo "minio    : not listening"
  fi

  if is_pid_running "$SERVER_PID_FILE"; then
    echo "server   : running (PID $(read_pid_file "$SERVER_PID_FILE"))"
  elif port_is_listening "$SERVER_PORT"; then
    echo "server   : port $SERVER_PORT in use by an external process"
  else
    echo "server   : stopped"
  fi

  if is_pid_running "$WEB_PID_FILE"; then
    echo "web      : running (PID $(read_pid_file "$WEB_PID_FILE"))"
  elif port_is_listening "$WEB_PORT"; then
    echo "web      : port $WEB_PORT in use by an external process"
  else
    echo "web      : stopped"
  fi

  echo "web url   : $WEB_LOGIN_URL"
  echo "api url   : $API_BASE_URL"
  if [[ -n "$MINIO_API_PORT" ]]; then
    echo "minio api : http://$(probe_http_host "$SERVER_HOST"):$MINIO_API_PORT"
    echo "minio ui  : http://$(probe_http_host "$SERVER_HOST"):$MINIO_CONSOLE_PORT"
  fi
  echo "logs     : $LOG_DIR"
}

stop_pid_process() {
  local name="$1"
  local pid_file="$2"
  local pid

  pid="$(read_pid_file "$pid_file")"
  if [[ -z "${pid:-}" ]]; then
    return 0
  fi

  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name (PID $pid)"
    kill "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
}

stop_stack() {
  print_header "Stopping local processes"
  stop_pid_process "web" "$WEB_PID_FILE"
  stop_pid_process "server" "$SERVER_PID_FILE"

  print_header "Stopping local infrastructure containers"
  docker compose -f "$DOCKER_COMPOSE_FILE" stop postgres redis minio >/dev/null || true
}

up() {
  require_command pnpm
  require_command docker
  require_command lsof
  require_command curl

  init_runtime_config

  ensure_server_env
  configure_infra_ports
  start_infra
  sync_database
  start_server
  start_web
  show_status
}

case "${1:-up}" in
  up)
    up
    ;;
  down)
    stop_stack
    ;;
  status)
    init_runtime_config
    show_status
    ;;
  *)
    echo "Usage: $0 [up|down|status]" >&2
    exit 1
    ;;
esac
