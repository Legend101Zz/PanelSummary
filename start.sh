#!/usr/bin/env zsh
# ============================================================
# PanelSummary — local dev starter
#
# Starts the full local stack:
#   v1 app surface          v2 agent plane
#   - Redis job broker      - domain-tool broker  :8010
#   - FastAPI backend :8000 - speed worker (M2.7-highspeed) :8788
#   - Celery worker         - quality worker (M3) :8789
#   - Next.js frontend :3000
#
# The agent plane is free to run idle — workers only call MiniMax
# when a chain script submits a run.
#
# Usage: ./start.sh
# Check: ./check.sh
# Stop:  ./stop.sh
# Logs:  .dev/logs/*.log
# ============================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
WORKER_DIR="$ROOT/apps/agent-worker"
DEV="$ROOT/.dev"
LOGS="$DEV/logs"
PIDS="$DEV/pids"
TOKENS_FILE="$DEV/agent-tokens.env"

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
  lsof -ti:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

port_holder() {
  local pid
  pid="$(lsof -ti:"$1" -sTCP:LISTEN 2>/dev/null | head -1)"
  [[ -n "$pid" ]] && ps -o comm= -p "$pid" 2>/dev/null || true
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

# The stale donor docker stack (scrollstack-*) publishes :8000. It is not
# this app; stop just that family when it blocks us. Never touch other
# docker containers or non-docker processes we didn't start.
claim_app_ports() {
  local port
  for port in 8000 3000 8010 8788 8789; do
    port_is_busy "$port" || continue
    local holder
    holder="$(port_holder "$port")"
    if [[ "$holder" == *docker* || "$holder" == *Docker* ]]; then
      if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^scrollstack-backend-1$'; then
        warn "Port $port is held by the stale scrollstack docker containers — stopping scrollstack-backend-1 + scrollstack-celery_worker-1"
        docker stop scrollstack-backend-1 scrollstack-celery_worker-1 >/dev/null 2>&1 || true
        sleep 2
        port_is_busy "$port" && fail "Port $port is still busy after stopping the scrollstack containers. Check: docker ps"
        ok "Stopped stale scrollstack containers (undo: docker start scrollstack-backend-1 scrollstack-celery_worker-1)"
      else
        fail "Port $port is held by a docker container that is not the known scrollstack family. Check: docker ps"
      fi
    else
      fail "Port $port is already in use by '$holder'. Run ./stop.sh first, or free the port."
    fi
  done
}

ensure_redis() {
  step "Checking Redis"
  if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
    ok "Redis is running"
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
  step "Checking backend Python environment"
  cd "$BACKEND"

  if [[ ! -d ".venv" ]]; then
    step "Creating backend/.venv and installing dependencies (first run only)"
    uv venv .venv --python 3.12 --quiet
    uv pip install -r requirements.txt --quiet
    ok "Created backend/.venv"
  else
    ok "backend/.venv exists (delete it to force a clean reinstall)"
  fi
}

ensure_node_env() {
  step "Checking Node environment"
  require_command node

  local major minor
  major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  minor="$(node -p 'Number(process.versions.node.split(".")[1])')"
  # agent-worker engines require >=22.19; frontend needs >=20
  if (( major < 22 || (major == 22 && minor < 19) )); then
    fail "Node >=22.19 is required (agent-worker engines). Current: $(node --version)."
  fi
  ok "Node $(node --version)"

  if [[ ! -d "$FRONTEND/node_modules" ]]; then
    step "Installing frontend packages (first run only)"
    cd "$FRONTEND"
    npm ci --silent
    ok "Frontend dependencies installed"
  fi

  require_command pnpm
  if [[ ! -d "$WORKER_DIR/node_modules" ]]; then
    step "Installing workspace packages (first run only)"
    cd "$ROOT"
    pnpm install --silent
    ok "Workspace dependencies installed"
  fi
}

# The v2 agent plane needs two distinct >=32-char service tokens. Generate
# once and persist so restarts (and later chain runs) reuse the same pair.
ensure_agent_tokens() {
  if [[ ! -f "$TOKENS_FILE" ]]; then
    step "Generating agent-plane service tokens (first run only)"
    umask 077
    cat >"$TOKENS_FILE" <<EOF
DOMAIN_TOOL_BROKER_TOKEN=$(openssl rand -hex 24)
AGENT_WORKER_TOKEN=$(openssl rand -hex 24)
EOF
    ok "Tokens written to .dev/agent-tokens.env (gitignored)"
  fi
  set -a
  source "$TOKENS_FILE"
  set +a

  MINIMAX_API_KEY="$(grep -E '^MINIMAX_API_KEY=' "$BACKEND/.env" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  [[ -n "${MINIMAX_API_KEY:-}" ]] || fail "MINIMAX_API_KEY not found in backend/.env — the agent workers need it."
}

start_backend() {
  step "Starting FastAPI backend (:8000)"
  cd "$BACKEND"
  nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload \
    </dev/null >"$LOGS/backend.log" 2>&1 &
  echo $! >"$PIDS/backend.pid"
  ok "FastAPI backend starting on http://localhost:8000 (pid $!)"
}

start_celery() {
  step "Starting Celery worker"
  cd "$BACKEND"
  # --pool=solo avoids macOS fork crashes in heavier PDF/image dependencies.
  nohup .venv/bin/celery -A app.celery_worker worker --loglevel=info --pool=solo \
    </dev/null >"$LOGS/celery.log" 2>&1 &
  echo $! >"$PIDS/celery.pid"
  ok "Celery worker started (pid $!)"
}

start_frontend() {
  step "Starting Next.js frontend (:3000)"
  cd "$FRONTEND"
  # </dev/null matters here: next dev reads stdin for keyboard shortcuts and
  # exits when the launching terminal closes — detach it or it dies with the tab.
  nohup npm run dev </dev/null >"$LOGS/frontend.log" 2>&1 &
  echo $! >"$PIDS/frontend.pid"
  ok "Next.js starting on http://localhost:3000 (pid $!)"
}

start_broker() {
  step "Starting domain-tool broker (:8010)"
  cd "$BACKEND"
  DOMAIN_TOOL_BROKER_TOKEN="$DOMAIN_TOOL_BROKER_TOKEN" \
    nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010 \
    </dev/null >"$LOGS/broker.log" 2>&1 &
  echo $! >"$PIDS/broker.pid"
  ok "Broker starting on http://127.0.0.1:8010 (pid $!)"
}

start_worker() {
  local mode="$1" port="$2" model="$3"
  step "Starting $mode agent worker (:$port, $model)"
  cd "$WORKER_DIR"
  AGENT_WORKER_HOST=127.0.0.1 \
    AGENT_WORKER_PORT="$port" \
    AGENT_WORKER_TOKEN="$AGENT_WORKER_TOKEN" \
    DOMAIN_TOOL_BROKER_URL="http://127.0.0.1:8010" \
    DOMAIN_TOOL_BROKER_TOKEN="$DOMAIN_TOOL_BROKER_TOKEN" \
    AGENT_PROVIDER=minimax \
    AGENT_MODEL="$model" \
    AGENT_MODEL_API_KEY_ENV=MINIMAX_API_KEY \
    MINIMAX_API_KEY="$MINIMAX_API_KEY" \
    nohup pnpm start </dev/null >"$LOGS/worker-$mode.log" 2>&1 &
  echo $! >"$PIDS/worker-$mode.pid"
  ok "$mode worker starting on http://127.0.0.1:$port (pid $!)"
}

print_summary() {
  step "Waiting for services (Next.js first compile can take ~1 min)"
  local backend_ok=false frontend_ok=false broker_ok=false speed_ok=false quality_ok=false
  wait_for_url "http://localhost:8000/health" 30 2 && backend_ok=true || true
  wait_for_url "http://127.0.0.1:8010/health" 15 2 && broker_ok=true || true
  wait_for_url "http://127.0.0.1:8788/healthz" 30 2 && speed_ok=true || true
  wait_for_url "http://127.0.0.1:8789/healthz" 30 2 && quality_ok=true || true
  wait_for_url "http://localhost:3000" 45 2 && frontend_ok=true || true

  echo ""
  echo "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  [[ "$backend_ok" == true ]] \
    && echo "${GREEN}  ✓ Backend        → http://localhost:8000 (docs: /docs)${RESET}" \
    || echo "${RED}  ✗ Backend failed — tail -f .dev/logs/backend.log${RESET}"
  [[ "$frontend_ok" == true ]] \
    && echo "${GREEN}  ✓ Frontend       → http://localhost:3000${RESET}" \
    || echo "${RED}  ✗ Frontend failed — tail -f .dev/logs/frontend.log${RESET}"
  [[ "$broker_ok" == true ]] \
    && echo "${GREEN}  ✓ Broker         → http://127.0.0.1:8010${RESET}" \
    || echo "${RED}  ✗ Broker failed — tail -f .dev/logs/broker.log${RESET}"
  [[ "$speed_ok" == true ]] \
    && echo "${GREEN}  ✓ Speed worker   → http://127.0.0.1:8788 (MiniMax-M2.7-highspeed)${RESET}" \
    || echo "${RED}  ✗ Speed worker failed — tail -f .dev/logs/worker-speed.log${RESET}"
  [[ "$quality_ok" == true ]] \
    && echo "${GREEN}  ✓ Quality worker → http://127.0.0.1:8789 (MiniMax-M3)${RESET}" \
    || echo "${RED}  ✗ Quality worker failed — tail -f .dev/logs/worker-quality.log${RESET}"
  echo "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  echo "Status:   ./check.sh"
  echo "Stop:     ./stop.sh"
  echo "Logs:     tail -f .dev/logs/<service>.log"
  echo "Chain runs reuse the same tokens: source .dev/agent-tokens.env"
  echo ""

  if [[ "$backend_ok" == true && "$frontend_ok" == true && "$broker_ok" == true \
        && "$speed_ok" == true && "$quality_ok" == true ]]; then
    ok "All services are up"
  else
    warn "One or more services failed readiness checks. See logs above."
  fi
}

print_banner
require_command curl
require_command lsof
require_command openssl
mkdir -p "$LOGS" "$PIDS"
claim_app_ports
ensure_redis
ensure_python_env
ensure_node_env
ensure_agent_tokens
start_backend
start_celery
start_frontend
start_broker
start_worker speed 8788 "MiniMax-M2.7-highspeed"
start_worker quality 8789 "MiniMax-M3"
print_summary
