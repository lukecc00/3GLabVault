#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DEV_SCRIPT="$ROOT_DIR/scripts/local-dev.sh"
RUNTIME_DIR="$ROOT_DIR/storage/dev"
SERVER_PID_FILE="$RUNTIME_DIR/server.pid"
WEB_PID_FILE="$RUNTIME_DIR/web.pid"

print_header() {
  printf '\n[%s] %s\n' "3GLabVault" "$1"
}

read_pid_file() {
  local pid_file="$1"

  if [[ -f "$pid_file" ]]; then
    tr -d '[:space:]' <"$pid_file"
  fi
}

kill_pid_from_file() {
  local name="$1"
  local pid_file="$2"
  local pid

  pid="$(read_pid_file "$pid_file")"
  if [[ -z "${pid:-}" ]]; then
    return 0
  fi

  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name from pid file (PID $pid)"
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      echo "Force killing $name (PID $pid)"
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  rm -f "$pid_file"
}

kill_port_listener() {
  local port="$1"
  local pids

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "${pids:-}" ]]; then
    return 0
  fi

  print_header "Cleaning port $port"
  while IFS= read -r pid; do
    [[ -z "${pid:-}" ]] && continue
    echo "Stopping listener on port $port (PID $pid)"
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      echo "Force killing listener on port $port (PID $pid)"
      kill -9 "$pid" 2>/dev/null || true
    fi
  done <<<"$pids"
}

wait_for_port_release() {
  local port="$1"
  local attempts="${2:-10}"
  local attempt=1

  while (( attempt <= attempts )); do
    if ! lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  echo "Port $port is still occupied after waiting." >&2
  return 1
}

print_header "Stopping managed local stack"
bash "$LOCAL_DEV_SCRIPT" down || true

print_header "Cleaning stale runtime processes"
kill_pid_from_file "server" "$SERVER_PID_FILE"
kill_pid_from_file "web" "$WEB_PID_FILE"

kill_port_listener 3001
kill_port_listener 3000

wait_for_port_release 3001
wait_for_port_release 3000

print_header "Starting fresh local stack"
bash "$LOCAL_DEV_SCRIPT" up

print_header "Restart complete"
echo "Web   : http://localhost:3000"
echo "API   : http://localhost:3001/api"
echo "Logs  : $ROOT_DIR/storage/dev/logs"
