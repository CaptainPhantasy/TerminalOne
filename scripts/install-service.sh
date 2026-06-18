#!/bin/bash
#
# TerminalOne — install the always-on macOS LaunchAgent (launchd).
#
# EFFECT RADIUS (what this changes on your machine):
#   - Writes ~/Library/LaunchAgents/com.floyd.terminalone.plist
#   - Registers a per-user LaunchAgent that runs `node src/server.js` on PORT 11001
#   - RunAtLoad (starts at login) + KeepAlive (auto-restart on crash)
#   - KeepAlive is gated on PathState: it only runs while
#     /Volumes/SanDisk1Tb/TerminalOne/src/server.js exists (i.e. the volume is
#     mounted), and auto-starts when the volume re-appears.
#   - Logs to ~/Library/Logs/com.floyd.terminalone.{out,err}.log (INTERNAL disk;
#     launchd cannot reliably create log files on the external volume -> EX_CONFIG).
# Fully reversible: scripts/uninstall-service.sh
#
set -euo pipefail

LABEL="com.floyd.terminalone"
APP_DIR="/Volumes/SanDisk1Tb/TerminalOne"
PORT="${PORT:-11001}"
NODE="$(command -v node || true)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
DOMAIN="gui/$(id -u)"

[ -n "$NODE" ] || { echo "ERROR: node not found in PATH"; exit 1; }
[ -f "$APP_DIR/src/server.js" ] || { echo "ERROR: $APP_DIR/src/server.js not found (is the volume mounted?)"; exit 1; }
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

# NOTE: no WorkingDirectory key — the server resolves all paths via __dirname, and a
# chdir into the external volume from the launchd context can itself trigger EX_CONFIG.
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$APP_DIR/src/server.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict>
    <key>PathState</key>
    <dict>
      <key>$APP_DIR/src/server.js</key><true/>
    </dict>
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/$LABEL.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/$LABEL.err.log</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLISTEOF

# (Re)load cleanly; clear any disabled/throttled state from prior failures.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl enable "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl kickstart -k "$DOMAIN/$LABEL" || true

echo "Installed $LABEL"
echo "  plist : $PLIST"
echo "  node  : $NODE"
echo "  logs  : $LOG_DIR/$LABEL.{out,err}.log"
echo "  url   : http://localhost:$PORT"
echo "Manage: launchctl print $DOMAIN/$LABEL   |   stop: scripts/uninstall-service.sh"
