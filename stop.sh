#!/usr/bin/env zsh
# ============================================================
# PanelSummary — local dev stopper
#
# Stops only the services started by ./start.sh plus processes still
# holding the app's dev ports (:8000 and :3000). It deliberately never
# touches port 8080, Teams, or Code Puppy. We like not breaking work.
# ============================================================

set -euo pipefail

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
  pids="$(lsof -ti:"$port" 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]*$//')"

  if [[ -z "$pids" ]]; then
    return
  fi

  warn "Freeing $label port $port (pid(s): $pids)"
  for pid in ${(z)pids}; do
    kill "$pid" 2>/dev/null || true
  done
  sleep 1
  for pid in ${(z)pids}; do
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  done
  ok "Freed port $port"
}

echo "${CYAN}${BOLD}Stopping PanelSummary local dev stack…${RESET}"

stop_pid_file /tmp/panelsummary_backend.pid "FastAPI backend"
stop_pid_file /tmp/panelsummary_celery.pid "Celery worker"
stop_pid_file /tmp/panelsummary_frontend.pid "Next.js frontend"

# Clean up dev ports owned by this app. Port 8080 is intentionally absent.
free_port 8000 "backend"
free_port 3000 "frontend"

ok "PanelSummary services stopped"
warn "Redis was left running because it may be shared. Stop it manually if needed: brew services stop redis"
