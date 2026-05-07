#!/usr/bin/env zsh
# ============================================================
# PanelSummary — local dev starter
#
# Starts the current app surface:
#   - Redis job broker
#   - FastAPI backend on :8000
#   - Celery worker
#   - Next.js frontend on :3000
#
# Usage: ./start.sh
# Stop:  ./stop.sh
# Logs:  tail -f /tmp/panelsummary-backend.log
#        tail -f /tmp/panelsummary-celery.log
#        tail -f /tmp/panelsummary-frontend.log
# ============================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PYPI_INDEX="https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple"
PYPI_HOST="pypi.ci.artifacts.walmart.com"

CYAN="\033[0;36m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
BOLD="\033[1m"
RESET="\033[0m"

step() { echo "${YELLOW}▶ $1${RESET}"; }
ok() { echo "${GREEN}✓ $1${RESET}"; }
warn() { echo "${YELLOW}⚠ $1${RESET}"; }
fail() { echo "${RED}✗ $1${RESET}"; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing '$1'. Install it first, then rerun ./start.sh."
}

port_is_busy() {
  lsof -ti:"$1" >/dev/null 2>&1
}

wait_for_url() {
  local url="$1"
  local attempts="$2"
  local delay="$3"
  for _ in $(seq 1 "$attempts"); do
    curl -fsS "$url" >/dev/null 2>&1 && return 0
    sleep "$delay"
  done
  return 1
}

print_banner() {
  echo ""
  echo "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo "${CYAN}${BOLD}  PanelSummary — starting local dev stack${RESET}"
  echo "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
}

ensure_redis() {
  step "Checking Redis"
  if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
    ok "Redis is already running"
    return
  fi

  if command -v brew >/dev/null 2>&1; then
    step "Starting Redis via Homebrew"
    brew services start redis >/dev/null 2>&1 || fail "Redis failed to start. Try: brew install redis"
    sleep 2
    redis-cli ping >/dev/null 2>&1 && ok "Redis started" || fail "Redis still is not reachable"
    return
  fi

  fail "Redis is not running and Homebrew is unavailable. Start Redis yourself or use docker compose."
}

ensure_python_env() {
  require_command uv
  step "Preparing backend Python environment"
  cd "$BACKEND"

  if [[ ! -d ".venv" ]]; then
    uv venv .venv --python 3.12 --quiet
    ok "Created backend/.venv"
  fi

  uv pip install \
    --index-url "$PYPI_INDEX" \
    --allow-insecure-host "$PYPI_HOST" \
    -r requirements.txt \
    --quiet
  ok "Backend dependencies are installed"
}

ensure_node_env() {
  step "Preparing frontend Node environment"

  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    nvm use 24 --silent >/dev/null 2>&1 || nvm install 24 --silent >/dev/null
  fi

  require_command node
  require_command npm

  local major
  major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  if [[ "$major" -lt 20 ]]; then
    fail "Node 20+ is required. Current: $(node --version). Use nvm install 24."
  fi
  ok "Node $(node --version)"

  cd "$FRONTEND"
  if [[ ! -d "node_modules" ]]; then
    step "Installing frontend packages"
    if [[ -f "package-lock.json" ]]; then
      npm ci --silent
    else
      npm install --silent
    fi
    ok "Frontend dependencies are installed"
  else
    ok "Frontend dependencies already exist"
  fi
}

start_backend() {
  port_is_busy 8000 && fail "Port 8000 is already in use. Run ./stop.sh or free the port."

  step "Starting FastAPI backend"
  cd "$BACKEND"
  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload \
    >/tmp/panelsummary-backend.log 2>&1 &
  echo $! >/tmp/panelsummary_backend.pid
  ok "FastAPI started on http://localhost:8000 (pid $!)"
}

start_celery() {
  step "Starting Celery worker"
  cd "$BACKEND"
  # --pool=solo avoids macOS fork crashes in heavier PDF/image dependencies.
  .venv/bin/celery -A app.celery_worker worker --loglevel=info --pool=solo \
    >/tmp/panelsummary-celery.log 2>&1 &
  echo $! >/tmp/panelsummary_celery.pid
  ok "Celery worker started (pid $!)"
}

start_frontend() {
  port_is_busy 3000 && fail "Port 3000 is already in use. Run ./stop.sh or free the port."

  step "Starting Next.js frontend"
  cd "$FRONTEND"
  npm run dev >/tmp/panelsummary-frontend.log 2>&1 &
  echo $! >/tmp/panelsummary_frontend.pid
  ok "Next.js starting on http://localhost:3000 (pid $!)"
}

print_summary() {
  local backend_ok="false"
  local frontend_ok="false"

  step "Waiting for services"
  wait_for_url "http://localhost:8000/health" 10 2 && backend_ok="true" || true
  wait_for_url "http://localhost:3000" 10 2 && frontend_ok="true" || true

  echo ""
  echo "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  if [[ "$backend_ok" == "true" ]]; then
    echo "${GREEN}  ✓ Backend  → http://localhost:8000${RESET}"
    echo "${GREEN}  ✓ API docs → http://localhost:8000/docs${RESET}"
  else
    echo "${RED}  ✗ Backend failed — tail -f /tmp/panelsummary-backend.log${RESET}"
  fi

  if [[ "$frontend_ok" == "true" ]]; then
    echo "${GREEN}  ✓ Frontend → http://localhost:3000${RESET}"
  else
    echo "${RED}  ✗ Frontend failed — tail -f /tmp/panelsummary-frontend.log${RESET}"
  fi
  echo "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  echo "Logs:"
  echo "  tail -f /tmp/panelsummary-backend.log"
  echo "  tail -f /tmp/panelsummary-celery.log"
  echo "  tail -f /tmp/panelsummary-frontend.log"
  echo ""
  echo "Stop: ./stop.sh"
  echo ""

  [[ "$backend_ok" == "true" && "$frontend_ok" == "true" ]] || warn "One or more services failed readiness checks. See logs above."
}

print_banner
require_command curl
require_command lsof
ensure_redis
ensure_python_env
ensure_node_env
start_backend
start_celery
start_frontend
print_summary
