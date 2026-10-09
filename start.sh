#!/usr/bin/env zsh
# ============================================================
# PanelSummary — one-command local stack
#
#   MongoDB (local, port 27018, data in .dev/mongo)   unless PANELSUMMARY_MONGODB_URL is set
#   Agent worker  :8788  — the sealed Pi harness; the ONLY process that holds the MiniMax key
#   API           :8000  — FastAPI (upload, books, editions, pages)
#   Job runner           — parse + generate jobs (calls the agent worker)
#   Frontend      :3100  — Next.js reader (never port 3000)
#
# MiniMax key lookup (never printed): $MINIMAX_API_KEY, then backend/.env,
# then the macOS Keychain item "minimax_api_key".
#
# Usage: ./start.sh      Check: ./check.sh      Stop: ./stop.sh      Logs: .dev/logs/
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEV="$ROOT/.dev"
LOGS="$DEV/logs"
PIDS="$DEV/pids"
TOKENS_FILE="$DEV/agent-tokens.env"
API_PORT="${PANELSUMMARY_API_PORT:-8000}"
WORKER_PORT="${PANELSUMMARY_WORKER_PORT:-8788}"
WEB_PORT="${PANELSUMMARY_WEB_PORT:-3100}"
MONGO_PORT="${PANELSUMMARY_MONGO_PORT:-27018}"

step() { print -P "%F{yellow}▶ $1%f"; }
ok() { print -P "%F{green}✓ $1%f"; }
fail() { print -P "%F{red}✗ $1%f"; exit 1; }

mkdir -p "$LOGS" "$PIDS"
umask 077

[[ "$WEB_PORT" == "3000" ]] && fail "Port 3000 is reserved on this machine; choose another PANELSUMMARY_WEB_PORT."
for cmd in node pnpm uv; do command -v "$cmd" >/dev/null || fail "Missing '$cmd'."; done

port_busy() { lsof -ti:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# start <name> <marker> <command...>: run detached, remember pid + a command marker for safe stop
start_service() {
  local name="$1" marker="$2"; shift 2
  if [[ -f "$PIDS/$name.pid" ]] && ps -p "$(cat "$PIDS/$name.pid")" -o command= 2>/dev/null | grep -q -- "$marker"; then
    ok "$name already running"; return
  fi
  nohup "$@" >"$LOGS/$name.log" 2>&1 </dev/null &
  echo "$!" >"$PIDS/$name.pid"
  echo "$marker" >"$PIDS/$name.marker"
}

wait_url() {
  local url="$1" tries="${2:-60}"
  for _ in $(seq 1 "$tries"); do curl -sf "$url" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

# --- secrets -----------------------------------------------------------------
MINIMAX_KEY="${MINIMAX_API_KEY:-}"
if [[ -z "$MINIMAX_KEY" && -f "$ROOT/backend/.env" ]]; then
  MINIMAX_KEY="$(grep -E '^MINIMAX_API_KEY=' "$ROOT/backend/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
fi
if [[ -z "$MINIMAX_KEY" ]] && command -v security >/dev/null; then
  MINIMAX_KEY="$(security find-generic-password -s minimax_api_key -w 2>/dev/null || true)"
fi
[[ -n "$MINIMAX_KEY" ]] || fail "No MiniMax key found (MINIMAX_API_KEY, backend/.env, or Keychain 'minimax_api_key')."

if [[ ! -f "$TOKENS_FILE" ]] || ! grep -q '^AGENT_WORKER_TOKEN=' "$TOKENS_FILE"; then
  echo "AGENT_WORKER_TOKEN=$(openssl rand -hex 32)" >"$TOKENS_FILE"
fi
AGENT_WORKER_TOKEN="$(grep '^AGENT_WORKER_TOKEN=' "$TOKENS_FILE" | cut -d= -f2-)"

# --- database ------------------------------------------------------------------
if [[ -n "${PANELSUMMARY_MONGODB_URL:-}" ]]; then
  MONGO_URL="$PANELSUMMARY_MONGODB_URL"
  ok "Using PANELSUMMARY_MONGODB_URL"
else
  command -v mongod >/dev/null || fail "Missing 'mongod' (brew install mongodb-community) or set PANELSUMMARY_MONGODB_URL."
  mkdir -p "$DEV/mongo"
  if ! port_busy "$MONGO_PORT"; then
    step "Starting MongoDB on :$MONGO_PORT"
    start_service mongo "mongod --dbpath $DEV/mongo" mongod --dbpath "$DEV/mongo" --port "$MONGO_PORT" --bind_ip 127.0.0.1
    sleep 2
  fi
  MONGO_URL="mongodb://127.0.0.1:$MONGO_PORT"
  ok "MongoDB at $MONGO_URL (local, never the Atlas URL in backend/.env)"
fi
DB_NAME="${PANELSUMMARY_DB_NAME:-panelsummary}"

# --- dependencies --------------------------------------------------------------
if [[ ! -d "$ROOT/node_modules/.pnpm" ]]; then step "pnpm install"; (cd "$ROOT" && pnpm install --frozen-lockfile); fi
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then step "frontend npm install"; (cd "$ROOT/frontend" && npm install); fi
# Python 3.12 (pydantic-core has no wheel for newer Pythons yet). A venv without uvicorn is
# a half-made one from a failed install: make it again instead of skipping it.
if [[ ! -x "$ROOT/backend/.venv/bin/uvicorn" ]]; then
  step "backend venv (Python 3.12)"
  (cd "$ROOT/backend" && uv venv --clear -p 3.12 && uv pip install -r requirements.txt) || fail "backend venv failed (needs Python 3.12 through uv)"
fi
mkdir -p "$ROOT/frontend/public/fonts"
cp "$ROOT/packages/manga-render/fonts/"*.ttf "$ROOT/frontend/public/fonts/"

# --- agent worker (MiniMax harness) -------------------------------------------
if ! port_busy "$WORKER_PORT"; then
  step "Starting the agent worker on :$WORKER_PORT"
  start_service worker "agent-worker/src/index.ts" env -i PATH="$PATH" HOME="$HOME" \
    MINIMAX_API_KEY="$MINIMAX_KEY" AGENT_WORKER_TOKEN="$AGENT_WORKER_TOKEN" \
    AGENT_WORKER_PORT="$WORKER_PORT" AGENT_WORKER_HOST=127.0.0.1 AGENT_MAX_CONCURRENCY="${AGENT_MAX_CONCURRENCY:-4}" \
    "$ROOT/apps/agent-worker/node_modules/.bin/tsx" "$ROOT/apps/agent-worker/src/index.ts"
fi
wait_url "http://127.0.0.1:$WORKER_PORT/readyz" 60 || fail "Agent worker not ready (see .dev/logs/worker.log)"
ok "Agent worker ready"
unset MINIMAX_KEY

BACKEND_ENV=(MONGODB_URL="$MONGO_URL" DB_NAME="$DB_NAME" AGENT_WORKER_URL="http://127.0.0.1:$WORKER_PORT"
  AGENT_WORKER_TOKEN="$AGENT_WORKER_TOKEN" CORS_ORIGINS="http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT")

# --- API + runner ----------------------------------------------------------------
if ! port_busy "$API_PORT"; then
  step "Starting the API on :$API_PORT"
  start_service api "uvicorn app.main:app --host 127.0.0.1 --port $API_PORT" \
    env -C "$ROOT/backend" "${BACKEND_ENV[@]}" "$ROOT/backend/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port "$API_PORT"
fi
wait_url "http://127.0.0.1:$API_PORT/health" 60 || fail "API not healthy (see .dev/logs/api.log)"
ok "API healthy"
step "Starting the job runner"
start_service runner "app.runner" env -C "$ROOT/backend" "${BACKEND_ENV[@]}" "$ROOT/backend/.venv/bin/python" -m app.runner
ok "Job runner started"

# --- frontend ----------------------------------------------------------------------
if ! port_busy "$WEB_PORT"; then
  step "Starting the frontend on :$WEB_PORT"
  start_service web "next dev" env -C "$ROOT/frontend" NEXT_PUBLIC_API_URL="http://127.0.0.1:$API_PORT" \
    zsh -c "tail -f /dev/null | exec npx next dev -p $WEB_PORT"
fi
wait_url "http://127.0.0.1:$WEB_PORT" 120 || fail "Frontend not up (see .dev/logs/web.log)"
ok "Open http://localhost:$WEB_PORT"
