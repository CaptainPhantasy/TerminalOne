#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ALT_ROOT="$TMP/alt-checkout"
FAKEBIN="$TMP/fakebin"
HOME_DIR="$TMP/home"
APP_PARENT="$TMP/apps"
BIN_DIR="$TMP/bin"
mkdir -p "$ALT_ROOT/scripts" "$ALT_ROOT/src" "$ALT_ROOT/public" "$ALT_ROOT/native" "$FAKEBIN" "$HOME_DIR"

cp "$ROOT/scripts/install-service.sh" "$ALT_ROOT/scripts/install-service.sh"
cp "$ROOT/scripts/t1.sh" "$ALT_ROOT/scripts/t1.sh"
cp "$ROOT/scripts/node-runtime.sh" "$ALT_ROOT/scripts/node-runtime.sh"
cp "$ROOT/scripts/run-hooks" "$ALT_ROOT/scripts/run-hooks"
cp "$ROOT/native/TerminalOneApp.swift" "$ALT_ROOT/native/TerminalOneApp.swift"
cp "$ROOT/src/server.js" "$ALT_ROOT/src/server.js"
cp "$ROOT/public/icon-512.png" "$ALT_ROOT/public/icon-512.png"
chmod +x "$ALT_ROOT/scripts/install-service.sh" "$ALT_ROOT/scripts/t1.sh" "$ALT_ROOT/scripts/node-runtime.sh" "$ALT_ROOT/scripts/run-hooks"

cat > "$FAKEBIN/node" <<'EOF'
#!/bin/bash
exit 0
EOF

cat > "$FAKEBIN/launchctl" <<'EOF'
#!/bin/bash
if [ "${1:-}" = "print" ]; then
  exit 1
fi
exit 0
EOF

cat > "$FAKEBIN/swiftc" <<'EOF'
#!/bin/bash
set -euo pipefail
out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then out="$2"; shift 2; else shift; fi
done
[ -n "$out" ]
cp /bin/echo "$out"
chmod +x "$out"
EOF

chmod +x "$FAKEBIN/node" "$FAKEBIN/launchctl" "$FAKEBIN/swiftc"

HOME="$HOME_DIR" \
PATH="$FAKEBIN:/usr/bin:/bin:/usr/sbin:/sbin" \
TERMINALONE_APPLICATIONS_DIR="$APP_PARENT" \
TERMINALONE_BIN_DIR="$BIN_DIR" \
TERMINALONE_SKIP_RUNTIME_CHECK=1 \
TERMINALONE_SWIFTC="$FAKEBIN/swiftc" \
bash "$ALT_ROOT/scripts/install-service.sh" >/tmp/t1-install-portability.log

PLIST_PATH="$HOME_DIR/Library/LaunchAgents/com.floyd.terminalone.plist"
T1_PATH="$BIN_DIR/t1"
APP_EXEC="$APP_PARENT/TerminalOne.app/Contents/MacOS/TerminalOne"

[ -f "$PLIST_PATH" ]
[ -f "$T1_PATH" ]
[ -f "$APP_EXEC" ]

grep -q "$ALT_ROOT/src/server.js" "$PLIST_PATH"
grep -q "$ALT_ROOT/scripts/t1.sh" "$T1_PATH"
file "$APP_EXEC" | grep -q 'Mach-O.*executable'
grep -q "$BIN_DIR/t1" "$APP_PARENT/TerminalOne.app/Contents/Resources/launcher-path.txt"

if grep -q '/Volumes/SanDisk1Tb/TerminalOne' "$PLIST_PATH" "$T1_PATH" "$APP_EXEC"; then
  echo "generated artifacts still reference the original machine path"
  exit 1
fi
