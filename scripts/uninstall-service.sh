#!/bin/bash
#
# TerminalOne — remove the always-on LaunchAgent. Full reversal of install-service.sh.
# Stops the running service and deletes the plist. Does not touch app code or ports
# beyond releasing 11001 when the process stops.
#
set -euo pipefail

LABEL="com.floyd.terminalone"
DOMAIN="gui/$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
if [ -f "$PLIST" ]; then
  rm -f "$PLIST"
  echo "Removed $PLIST"
else
  echo "No plist found at $PLIST (nothing to remove)"
fi
echo "TerminalOne service uninstalled."
