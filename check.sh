#!/usr/bin/env zsh
# ============================================================
# PanelSummary — local dev status check
#
# Read-only: probes every service ./start.sh manages and reports what is
# up, what is down, and who is actually holding each port. Makes no
# writes and no model calls.
#
# Exit codes: 0 = everything up, 2 = everything down, 1 = partial/other.
# ============================================================

set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS="$ROOT/.dev/pids"

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
BOLD="\033[1m"
RESET="\033[0m"

up_count=0
down_count=0

row() {
  local state="$1" name="$2" detail="$3"
  case "$state" in
    up)   echo "${GREEN}  ✓ ${(r:16:)name} $detail${RESET}"; ((up_count++)) ;;
    warn) echo "${YELLOW}  ~ ${(r:16:)name} $detail${RESET}"; ((up_count++)) ;;
    down) echo "${RED}  ✗ ${(r:16:)name} $detail${RESET}"; ((down_count++)) ;;
  esac
}

port_holder() {
  local pid
  pid="$(lsof -ti:"$1" -sTCP:LISTEN 2>/dev/null | head -1)"
  [[ -n "$pid" ]] && ps -o comm= -p "$pid" 2>/dev/null | xargs basename 2>/dev/null
}

http_service() {
  local name="$1" port="$2" url="$3"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null)"
  if [[ "$code" == 2* || "$code" == 3* ]]; then
    row up "$name" ":$port  $url"
  else
    local holder
    holder="$(port_holder "$port")"
    if [[ -n "$holder" ]]; then
      row down "$name" ":$port held by '$holder' but $url answered HTTP ${code:-nothing}"
    else
      row down "$name" ":$port  not running"
    fi
  fi
}

worker_service() {
  local name="$1" port="$2"
  local health ready
  health="$(curl -s --max-time 3 "http://127.0.0.1:$port/healthz" 2>/dev/null)"
  if [[ "$health" != *'"ok"'* ]]; then
    local holder
    holder="$(port_holder "$port")"
    if [[ -n "$holder" ]]; then
      row down "$name" ":$port held by '$holder' but /healthz did not answer"
    else
      row down "$name" ":$port  not running"
    fi
    return
  fi
  ready="$(curl -s --max-time 3 "http://127.0.0.1:$port/readyz" 2>/dev/null)"
  if [[ "$ready" == *'"ready"'* ]]; then
    row up "$name" ":$port  healthy + ready (model credential loaded)"
  else
    row warn "$name" ":$port  healthy but NOT ready — model credential missing?"
  fi
}

pid_service() {
  local name="$1" file="$2" pattern="$3"
  local pid=""
  [[ -f "$file" ]] && pid="$(cat "$file" 2>/dev/null)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    row up "$name" "pid $pid"
  elif pgrep -f "$pattern" >/dev/null 2>&1; then
    row warn "$name" "running but not started by ./start.sh (pgrep '$pattern')"
  else
    row down "$name" "not running"
  fi
}

echo ""
echo "${CYAN}${BOLD}PanelSummary — service status${RESET}"
echo ""

if redis-cli ping >/dev/null 2>&1; then
  row up "Redis" ":6379  PONG"
else
  row down "Redis" ":6379  not answering (brew services start redis)"
fi

# Redis is shared infrastructure, not part of the stack ./start.sh owns —
# classify "stack stopped" by the app services alone.
infra_up=$up_count
infra_down=$down_count

http_service "Backend" 8000 "http://localhost:8000/health"
pid_service "Celery" "$PIDS/celery.pid" "celery.*app.celery_worker"
http_service "Frontend" 3000 "http://localhost:3000"
http_service "Broker" 8010 "http://127.0.0.1:8010/health"
worker_service "Speed worker" 8788
worker_service "Quality worker" 8789

# Surface the stale donor docker stack when it holds our ports.
if docker ps --format '{{.Names}}  {{.Ports}}' 2>/dev/null | grep -E '^scrollstack-.*(8000|3000|8010|8788|8789)' >/dev/null 2>&1; then
  echo ""
  echo "${YELLOW}  ⚠ Stale scrollstack docker containers are holding app ports.${RESET}"
  echo "${YELLOW}    ./start.sh stops them automatically, or: docker stop scrollstack-backend-1 scrollstack-celery_worker-1${RESET}"
fi

app_up=$(( up_count - infra_up ))
app_down=$(( down_count - infra_down ))

echo ""
if (( down_count == 0 )); then
  echo "${GREEN}${BOLD}All services up.${RESET}"
  exit 0
elif (( app_up == 0 )); then
  echo "${CYAN}Stack is stopped. Start it with ./start.sh${RESET}"
  exit 2
else
  echo "${YELLOW}${BOLD}Partial: $app_up of $(( app_up + app_down )) app services up. Logs: .dev/logs/${RESET}"
  exit 1
fi
