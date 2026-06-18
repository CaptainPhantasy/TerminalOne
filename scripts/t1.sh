#!/bin/bash
#
# t1 — open TerminalOne. Ensures the always-on service is running, waits for it to
# be healthy, then opens the UI as a chrome-less app window (falls back to the
# default browser). Add a shortcut with:  alias t1="/Volumes/SanDisk1Tb/TerminalOne/scripts/t1.sh"
#
set -euo pipefail

PORT="${PORT:-11001}"
URL="http://localhost:$PORT"
LABEL="com.floyd.terminalone"
DOMAIN="gui/$(id -u)"

# Nudge the service (no-op if it isn't installed / already running).
launchctl kickstart "$DOMAIN/$LABEL" 2>/dev/null || true

# Wait up to ~8s for health.
for _ in $(seq 1 32); do
  if curl -sf "$URL/health" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL"
elif [ -d "/Applications/Google Chrome Beta.app" ]; then
  open -na "Google Chrome Beta" --args --app="$URL"
else
  open "$URL"
fi
echo "TerminalOne -> $URL"
