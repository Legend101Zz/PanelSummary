#!/usr/bin/env zsh
# Stops only the processes ./start.sh started (pid + command marker must match).
# Never kills by port, so unrelated services (for example on :3000) are safe.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS="$ROOT/.dev/pids"
[[ -d "$PIDS" ]] || { echo "nothing to stop"; exit 0; }
for pidfile in "$PIDS"/*.pid(N); do
  name="$(basename "$pidfile" .pid)"
  pid="$(cat "$pidfile")"
  marker="$(cat "$PIDS/$name.marker" 2>/dev/null || true)"
  if [[ -n "$marker" ]] && ps -p "$pid" -o command= 2>/dev/null | grep -q -- "$marker"; then
    pkill -TERM -P "$pid" 2>/dev/null
    kill -TERM "$pid" 2>/dev/null && echo "stopped $name ($pid)"
  else
    echo "skipped $name (pid $pid is not ours any more)"
  fi
  rm -f "$pidfile" "$PIDS/$name.marker"
done
# next dev leaves a child server; stop it only if it runs from this repo's frontend.
for pid in $(pgrep -f "next-server|next dev" 2>/dev/null); do
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
  [[ "$cwd" == "$ROOT/frontend" ]] && kill -TERM "$pid" 2>/dev/null && echo "stopped next ($pid)"
done
exit 0
