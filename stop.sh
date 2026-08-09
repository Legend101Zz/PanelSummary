#!/usr/bin/env zsh
# ============================================================
# PanelSummary — local dev stopper
#
# Stops the services started by ./start.sh (v1 app surface + v2 agent
# plane) plus any processes still holding the app's dev ports. It never
# kills Docker itself — if a docker container holds a port, it tells you
# which one to stop instead.
# ============================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS="$ROOT/.dev/pids"

CYAN="\033[0;36m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BOLD="\033[1m"
RESET="\033[0m"

ok() { echo "${GREEN}✓ $1${RESET}"; }
warn() { echo "${YELLOW}⚠ $1${RESET}"; }

stop_pid_file() {
  local file="$1"
  local label="$2"

  if [[ ! -f "$file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$file" 2>/dev/null || true)"
  rm -f "$file"

  if [[ -z "$pid" ]]; then
    return
  fi

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    ok "Stopped $label (pid $pid)"
  fi
}

free_port() {
  local port="$1"
  local label="$2"
  local pids
  # lsof exits 1 when the port is free — mask it or set -e kills the script
  pids="$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)"

  if [[ -z "$pids" ]]; then
    return
  fi

  for pid in ${(z)pids}; do
    local comm
    comm="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
    # Never kill Docker's port-forwarder — that takes down Docker Desktop
    # networking. Point at the container instead.
    if [[ "$comm" == *docker* || "$comm" == *Docker* ]]; then
      warn "Port $port is held by a docker container — stop it with: docker ps / docker stop <name>"
      continue
    fi
    warn "Freeing $label port $port (pid $pid, $comm)"
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    ok "Freed port $port"
  done
}

echo "${CYAN}${BOLD}Stopping PanelSummary local dev stack…${RESET}"

stop_pid_file "$PIDS/backend.pid" "FastAPI backend"
stop_pid_file "$PIDS/celery.pid" "Celery worker"
stop_pid_file "$PIDS/frontend.pid" "Next.js frontend"
stop_pid_file "$PIDS/broker.pid" "domain-tool broker"
stop_pid_file "$PIDS/worker-speed.pid" "speed agent worker"
stop_pid_file "$PIDS/worker-quality.pid" "quality agent worker"

# Legacy pid files from the pre-v2 start.sh.
stop_pid_file /tmp/panelsummary_backend.pid "FastAPI backend (legacy)"
stop_pid_file /tmp/panelsummary_celery.pid "Celery worker (legacy)"
stop_pid_file /tmp/panelsummary_frontend.pid "Next.js frontend (legacy)"

free_port 8000 "backend"
free_port 3000 "frontend"
free_port 8010 "broker"
free_port 8788 "speed worker"
free_port 8789 "quality worker"

ok "PanelSummary services stopped"
warn "Redis was left running because it may be shared. Stop it manually if needed: brew services stop redis"
