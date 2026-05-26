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

ensure_server_env() {
  local env_file="$ROOT_DIR/apps/server/.env"
  local example_file="$ROOT_DIR/apps/server/.env.example"

  if [[ ! -f "$env_file" ]]; then
    cp "$example_file" "$env_file"
    echo "Created apps/server/.env from .env.example"
  fi
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

start_postgres() {
  print_header "Starting PostgreSQL container"
  docker compose -f "$DOCKER_COMPOSE_FILE" up -d postgres >/dev/null

  local attempt=1
  while (( attempt <= 40 )); do
    if port_is_listening 5432; then
      echo "PostgreSQL is listening on port 5432"
      return 0
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  echo "PostgreSQL did not start in time" >&2
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

  if port_is_listening 3001; then
    echo "Port 3001 is already in use. Assuming API is already running."
    return 0
  fi

  print_header "Building API server"
  (cd "$ROOT_DIR/apps/server" && pnpm build)

  print_header "Starting API server"
  (
    cd "$ROOT_DIR/apps/server" &&
      nohup node scripts/run-local-server.cjs >"$SERVER_LOG_FILE" 2>&1 &
      echo $! >"$SERVER_PID_FILE"
  )

  if ! wait_for_http "http://127.0.0.1:3001/api" 60 1; then
    echo "API server failed to start. Recent log output:" >&2
    tail -n 80 "$SERVER_LOG_FILE" >&2 || true
    exit 1
  fi

  echo "API server is ready on http://localhost:3001/api"
}

start_web() {
  if is_pid_running "$WEB_PID_FILE"; then
    echo "Web app already running with PID $(read_pid_file "$WEB_PID_FILE")"
    return 0
  fi

  if port_is_listening 3000; then
    echo "Port 3000 is already in use. Assuming web app is already running."
    return 0
  fi

  print_header "Starting web app"
  (
    cd "$ROOT_DIR/apps/web" &&
      nohup pnpm dev >"$WEB_LOG_FILE" 2>&1 &
      echo $! >"$WEB_PID_FILE"
  )

  if ! wait_for_http "http://127.0.0.1:3000/login" 90 1; then
    echo "Web app failed to start. Recent log output:" >&2
    tail -n 80 "$WEB_LOG_FILE" >&2 || true
    exit 1
  fi

  echo "Web app is ready on http://localhost:3000/login"
}

show_status() {
  print_header "Current status"

  if port_is_listening 5432; then
    echo "postgres : listening on 5432"
  else
    echo "postgres : not listening on 5432"
  fi

  if is_pid_running "$SERVER_PID_FILE"; then
    echo "server   : running (PID $(read_pid_file "$SERVER_PID_FILE"))"
  elif port_is_listening 3001; then
    echo "server   : port 3001 in use by an external process"
  else
    echo "server   : stopped"
  fi

  if is_pid_running "$WEB_PID_FILE"; then
    echo "web      : running (PID $(read_pid_file "$WEB_PID_FILE"))"
  elif port_is_listening 3000; then
    echo "web      : port 3000 in use by an external process"
  else
    echo "web      : stopped"
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

  print_header "Stopping PostgreSQL container"
  docker compose -f "$DOCKER_COMPOSE_FILE" stop postgres >/dev/null || true
}

up() {
  require_command pnpm
  require_command docker
  require_command lsof
  require_command curl

  ensure_server_env
  start_postgres
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
    show_status
    ;;
  *)
    echo "Usage: $0 [up|down|status]" >&2
    exit 1
    ;;
esac
