#!/usr/bin/env zsh
# Stop all PanelSummary services
# Kills: FastAPI, Celery workers, Next.js dev server, Remotion renders
# Safe: Never kills Microsoft Teams (port 8080) or code-puppy

CYAN="\033[0;36m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RESET="\033[0m"; BOLD="\033[1m"

echo "${CYAN}${BOLD}⏹  Stopping PanelSummary...${RESET}"

# ─── Step 1: Stop via PID files ─────────────────────────────
for f in /tmp/panelsummary_backend.pid /tmp/panelsummary_celery.pid /tmp/panelsummary_frontend.pid; do
  if [ -f "$f" ]; then
    PID=$(cat "$f")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null && echo "${GREEN}✓ Stopped pid $PID ($(basename $f .pid))${RESET}"
    fi
    rm -f "$f"
  fi
done

# ─── Step 2: Kill ALL celery workers for this project ───────
# Match any celery process running from our backend directory
CELERY_PIDS=$(ps aux | grep -E 'celery.*app\.celery_worker' | grep -v grep | grep -v 'code-puppy' | awk '{print $2}')
if [ -n "$CELERY_PIDS" ]; then
  echo "${YELLOW}Killing stale celery workers: $CELERY_PIDS${RESET}"
  echo "$CELERY_PIDS" | xargs kill -9 2>/dev/null || true
  echo "${GREEN}✓ Celery workers killed${RESET}"
fi

# ─── Step 3: Kill stragglers by process name ────────────────
# uvicorn for our app
pkill -f "uvicorn app.main" 2>/dev/null || true

# Next.js dev server in our frontend directory
pkill -f "next dev.*PanelSummary" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true

# Reel renderer (Remotion) — orphaned renders from killed Celery
REMOTION_PIDS=$(ps aux | grep -E 'remotion render' | grep -v grep | grep -v 'code-puppy' | awk '{print $2}')
if [ -n "$REMOTION_PIDS" ]; then
  echo "${YELLOW}Killing stale Remotion renders: $REMOTION_PIDS${RESET}"
  echo "$REMOTION_PIDS" | xargs kill -9 2>/dev/null || true
  echo "${GREEN}✓ Remotion renders killed${RESET}"
fi

# ─── Step 4: Free up port 8000 (but NOT 8080 = Teams) ──────
PORT_8000_PID=$(lsof -ti:8000 2>/dev/null | head -1)
if [ -n "$PORT_8000_PID" ]; then
  kill "$PORT_8000_PID" 2>/dev/null && echo "${GREEN}✓ Freed port 8000 (pid $PORT_8000_PID)${RESET}" || true
fi

PORT_3000_PID=$(lsof -ti:3000 2>/dev/null | head -1)
if [ -n "$PORT_3000_PID" ]; then
  kill "$PORT_3000_PID" 2>/dev/null && echo "${GREEN}✓ Freed port 3000 (pid $PORT_3000_PID)${RESET}" || true
fi

echo "${GREEN}${BOLD}✓ All PanelSummary services stopped${RESET}"
