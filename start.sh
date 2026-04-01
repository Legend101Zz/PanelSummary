#!/usr/bin/env zsh
# ============================================================
# PanelSummary — Start Script
# Run this once to bring up everything:
#   backend (FastAPI + Celery) + frontend (Next.js)
#
# Usage:  ./start.sh
# Stop:   ./stop.sh
# Logs:   tail -f /tmp/backend.log  |  tail -f /tmp/frontend.log
# ============================================================

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# ─── Colors ─────────────────────────────────────────────────
CYAN="\033[0;36m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
BOLD="\033[1m"
RESET="\033[0m"

banner() {
  echo ""
  echo "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo "${CYAN}${BOLD}  ⚡ PanelSummary — Starting Up${RESET}"
  echo "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
}

step() { echo "${YELLOW}▶ $1${RESET}"; }
ok()   { echo "${GREEN}✓ $1${RESET}"; }
err()  { echo "${RED}✗ $1${RESET}"; exit 1; }

banner

# ─── Check Redis ─────────────────────────────────────────────
step "Checking Redis..."
if redis-cli ping > /dev/null 2>&1; then
  ok "Redis is running"
else
  step "Starting Redis..."
  brew services start redis > /dev/null 2>&1 || err "Redis failed to start — run: brew install redis"
  sleep 2
  redis-cli ping > /dev/null 2>&1 && ok "Redis started" || err "Redis still not reachable"
fi

# ─── Backend — uv venv ───────────────────────────────────────
step "Setting up Python environment..."
cd "$BACKEND"

if [ ! -d ".venv" ]; then
  uv venv .venv --python 3.12 --quiet
  ok "Virtual env created"
fi

# Install / sync deps quietly
uv pip install -r requirements.txt --quiet 2>&1 | grep -E "error|Error" || true
ok "Backend dependencies ready"

# ─── Start FastAPI ───────────────────────────────────────────
step "Starting FastAPI backend..."
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/panelsummary_backend.pid
ok "FastAPI → http://localhost:8000  (pid $BACKEND_PID)"

# ─── Start Celery ────────────────────────────────────────────
step "Starting Celery worker..."
# --pool=solo avoids fork() which crashes PyTorch/Docling on macOS Apple Silicon
celery -A app.celery_worker worker --loglevel=info --pool=solo > /tmp/celery.log 2>&1 &
CELERY_PID=$!
echo $CELERY_PID > /tmp/panelsummary_celery.pid
ok "Celery worker running           (pid $CELERY_PID)"

# ─── Frontend — nvm + Node 24 ────────────────────────────────
step "Setting up Node 24 via nvm..."
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm use 24 --silent
ok "Node $(node --version)"

cd "$FRONTEND"

if [ ! -d "node_modules" ]; then
  step "Installing npm packages (first-time, ~1 min)..."
  npm install --silent
  ok "npm packages installed"
fi

step "Starting Next.js frontend..."
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/panelsummary_frontend.pid

# ─── Wait for readiness ──────────────────────────────────────
echo ""
step "Waiting for services to be ready..."
sleep 6

BACKEND_OK=false
FRONTEND_OK=false

for i in 1 2 3 4 5; do
  curl -sf http://localhost:8000/health > /dev/null 2>&1 && BACKEND_OK=true && break
  sleep 2
done

for i in 1 2 3 4 5; do
  curl -sf http://localhost:3000 > /dev/null 2>&1 && FRONTEND_OK=true && break
  sleep 2
done

echo ""
echo "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
$BACKEND_OK  && echo "${GREEN}  ✓ Backend   → http://localhost:8000${RESET}"  || echo "${RED}  ✗ Backend failed — check: tail -f /tmp/backend.log${RESET}"
$FRONTEND_OK && echo "${GREEN}  ✓ Frontend  → http://localhost:3000${RESET}"  || echo "${RED}  ✗ Frontend failed — check: tail -f /tmp/frontend.log${RESET}"
echo "${GREEN}  ✓ API Docs  → http://localhost:8000/docs${RESET}"
echo "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo "  Logs:  tail -f /tmp/backend.log"
echo "         tail -f /tmp/celery.log"
echo "         tail -f /tmp/frontend.log"
echo ""
echo "  Stop:  ./stop.sh"
echo ""
