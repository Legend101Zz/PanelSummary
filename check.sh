#!/usr/bin/env zsh
# Reports the local stack. Exit 0 = all up, 2 = all down, 1 = partial.
set -uo pipefail
API_PORT="${PANELSUMMARY_API_PORT:-8000}"
WORKER_PORT="${PANELSUMMARY_WORKER_PORT:-8788}"
WEB_PORT="${PANELSUMMARY_WEB_PORT:-3100}"
up=0; down=0
probe() {
  if curl -sf "$2" >/dev/null 2>&1; then print -P "%F{green}✓%f $1  $2"; up=$((up+1)); else print -P "%F{red}✗%f $1  $2"; down=$((down+1)); fi
}
probe "agent worker" "http://127.0.0.1:$WORKER_PORT/readyz"
probe "api         " "http://127.0.0.1:$API_PORT/health"
probe "frontend    " "http://127.0.0.1:$WEB_PORT"
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$ROOT/.dev/pids/runner.pid" ]] && ps -p "$(cat "$ROOT/.dev/pids/runner.pid")" -o command= 2>/dev/null | grep -q app.runner; then
  print -P "%F{green}✓%f job runner (pid $(cat "$ROOT/.dev/pids/runner.pid"))"; up=$((up+1))
else
  print -P "%F{red}✗%f job runner"; down=$((down+1))
fi
(( down == 0 )) && exit 0
(( up == 0 )) && exit 2
exit 1
