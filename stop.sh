#!/usr/bin/env zsh
# Stop all PanelSummary services

CYAN="\033[0;36m"; GREEN="\033[0;32m"; RESET="\033[0m"; BOLD="\033[1m"

echo "${CYAN}${BOLD}⏹  Stopping PanelSummary...${RESET}"

for f in /tmp/panelsummary_backend.pid /tmp/panelsummary_celery.pid /tmp/panelsummary_frontend.pid; do
  if [ -f "$f" ]; then
    PID=$(cat "$f")
    kill "$PID" 2>/dev/null && echo "${GREEN}✓ Stopped pid $PID${RESET}" || true
    rm -f "$f"
  fi
done

# Catch any stragglers
pkill -f "uvicorn app.main" 2>/dev/null || true
pkill -f "celery.*panelsummary" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

echo "${GREEN}✓ All stopped${RESET}"
