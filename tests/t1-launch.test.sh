#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAKEBIN="$TMP/fakebin"
mkdir -p "$FAKEBIN" "$TMP/logs" "$TMP/state"

cat > "$FAKEBIN/open" <<'EOF'
#!/bin/bash
echo "OPEN:$*" >> "$STATE_FILE"
EOF

cat > "$FAKEBIN/curl" <<'EOF'
#!/bin/bash
echo "CURL:$*" >> "$STATE_FILE"
if [ -f "$HEALTHY_FILE" ]; then
  exit 0
fi
exit 7
EOF

cat > "$FAKEBIN/launchctl" <<'EOF'
#!/bin/bash
echo "LAUNCHCTL:$*" >> "$STATE_FILE"
exit 0
EOF

cat > "$FAKEBIN/node" <<'EOF'
#!/bin/bash
case "${1:-}" in
  -p)
    case "${2:-}" in *modules*) echo 127 ;; *) echo 22 ;; esac
    exit 0
    ;;
  -v) echo v22.18.0; exit 0 ;;
  -) exit 0 ;;
esac
echo "NODE:$*" >> "$STATE_FILE"
if [ -n "${NODE_START_DELAY:-}" ]; then
  /bin/sleep "$NODE_START_DELAY"
fi
touch "$HEALTHY_FILE"
/bin/sleep 1
EOF

cat > "$FAKEBIN/lsof" <<'EOF'
#!/bin/bash
exit 1
EOF

cat > "$FAKEBIN/osascript" <<'EOF'
#!/bin/bash
echo "OSASCRIPT:$*" >> "$STATE_FILE"
EOF

cat > "$FAKEBIN/sleep" <<'EOF'
#!/bin/bash
/bin/sleep 0.01
EOF

chmod +x "$FAKEBIN/"*

STATE_FILE="$TMP/state/events.log"
HEALTHY_FILE="$TMP/state/healthy"

for help_arg in --help -h help; do
  : > "$STATE_FILE"
  help_output="$TMP/state/help-${help_arg#-}.txt"
  STATE_FILE="$STATE_FILE" \
  HEALTHY_FILE="$HEALTHY_FILE" \
  PATH="$FAKEBIN:/usr/bin:/bin:/usr/sbin:/sbin" \
  TERMINALONE_APP_DIR="$ROOT" \
  TERMINALONE_LOG_DIR="$TMP/logs" \
  PORT=11001 \
  bash "$ROOT/scripts/t1.sh" "$help_arg" > "$help_output"

  grep -q '^Usage: t1 ' "$help_output"
  if [ -s "$STATE_FILE" ]; then
    echo "$help_arg must not launch a service or browser"
    cat "$STATE_FILE"
    exit 1
  fi
done

STATE_FILE="$STATE_FILE" \
HEALTHY_FILE="$HEALTHY_FILE" \
PATH="$FAKEBIN:/usr/bin:/bin:/usr/sbin:/sbin" \
TERMINALONE_APP_DIR="$ROOT" \
TERMINALONE_LOG_DIR="$TMP/logs" \
PORT=11001 \
bash "$ROOT/scripts/t1.sh"

grep -q 'LAUNCHCTL:kickstart' "$TMP/state/events.log"
grep -q 'NODE:' "$TMP/state/events.log"
grep -q 'OPEN:' "$TMP/state/events.log"

cat > "$FAKEBIN/lsof" <<'EOF'
#!/bin/bash
echo "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME"
echo "python3 99999 user   12u  IPv4    0x0      0t0  TCP *:11001 (LISTEN)"
EOF
chmod +x "$FAKEBIN/lsof"
rm -f "$HEALTHY_FILE"

if STATE_FILE="$TMP/state/port.log" \
   HEALTHY_FILE="$TMP/state/healthy" \
   PATH="$FAKEBIN:/usr/bin:/bin:/usr/sbin:/sbin" \
   TERMINALONE_APP_DIR="$ROOT" \
   TERMINALONE_LOG_DIR="$TMP/logs" \
   PORT=11001 \
   bash "$ROOT/scripts/t1.sh"; then
  echo "expected port collision failure"
  exit 1
fi

grep -q 'LAUNCHCTL:kickstart' "$TMP/state/port.log"
grep -q 'OSASCRIPT:' "$TMP/state/port.log"
if grep -q 'OPEN:' "$TMP/state/port.log"; then
  echo "port collision should not open the UI"
  exit 1
fi

cat > "$FAKEBIN/lsof" <<'EOF'
#!/bin/bash
echo "COMMAND PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME"
echo "node    123 user   12u  IPv4    0x0      0t0  TCP *:11001 (LISTEN)"
EOF
chmod +x "$FAKEBIN/lsof"

rm -f "$HEALTHY_FILE"
: > "$TMP/state/node-listener.log"
STATE_FILE="$TMP/state/node-listener.log" \
HEALTHY_FILE="$HEALTHY_FILE" \
PATH="$FAKEBIN:/usr/bin:/bin:/usr/sbin:/sbin" \
TERMINALONE_APP_DIR="$ROOT" \
TERMINALONE_LOG_DIR="$TMP/logs" \
PORT=11001 \
bash "$ROOT/scripts/t1.sh" --serve-only > "$TMP/state/node-listener.out" 2>&1

grep -q 'TerminalOne service ready' "$TMP/state/node-listener.out"
if grep -q 'already in use by another process' "$TMP/state/node-listener.out"; then
  echo "Node listener must not be treated as a foreign port owner"
  exit 1
fi

rm -f "$HEALTHY_FILE"
: > "$TMP/state/overlap.log"
STATE_FILE="$TMP/state/overlap.log" \
HEALTHY_FILE="$HEALTHY_FILE" \
NODE_START_DELAY=0.1 \
PATH="$FAKEBIN:/usr/bin:/bin:/usr/sbin:/sbin" \
TERMINALONE_APP_DIR="$ROOT" \
TERMINALONE_LOG_DIR="$TMP/logs" \
PORT=11001 \
bash "$ROOT/scripts/t1.sh" --serve-only > "$TMP/state/overlap-1.out" 2>&1 &
first_pid=$!
STATE_FILE="$TMP/state/overlap.log" \
HEALTHY_FILE="$HEALTHY_FILE" \
NODE_START_DELAY=0.1 \
PATH="$FAKEBIN:/usr/bin:/bin:/usr/sbin:/sbin" \
TERMINALONE_APP_DIR="$ROOT" \
TERMINALONE_LOG_DIR="$TMP/logs" \
PORT=11001 \
bash "$ROOT/scripts/t1.sh" --serve-only > "$TMP/state/overlap-2.out" 2>&1 &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
grep -q 'TerminalOne service ready' "$TMP/state/overlap-1.out"
grep -q 'TerminalOne service ready' "$TMP/state/overlap-2.out"
if grep -q 'already in use by another process' "$TMP/state/overlap-1.out" "$TMP/state/overlap-2.out"; then
  echo "overlapping launches must not report a false port conflict"
  exit 1
fi

cat > "$FAKEBIN/lsof" <<'EOF'
#!/bin/bash
exit 1
EOF
chmod +x "$FAKEBIN/lsof"

ALT_ROOT="$TMP/alt-checkout"
mkdir -p "$ALT_ROOT/scripts" "$ALT_ROOT/src" \
  "$ALT_ROOT/node_modules/node-pty/prebuilds/test"
cp "$ROOT/scripts/t1.sh" "$ALT_ROOT/scripts/t1.sh"
cp "$ROOT/scripts/node-runtime.sh" "$ALT_ROOT/scripts/node-runtime.sh"
cp "$ROOT/scripts/run-hooks" "$ALT_ROOT/scripts/run-hooks"
touch "$ALT_ROOT/src/server.js"
touch "$ALT_ROOT/node_modules/node-pty/prebuilds/test/spawn-helper"
chmod +x "$ALT_ROOT/scripts/"* \
  "$ALT_ROOT/node_modules/node-pty/prebuilds/test/spawn-helper"

ALT_HEALTHY_FILE="$TMP/state/derived-healthy"
STATE_FILE="$TMP/state/derived.log" \
HEALTHY_FILE="$ALT_HEALTHY_FILE" \
PATH="$FAKEBIN:/usr/bin:/bin:/usr/sbin:/sbin" \
TERMINALONE_LOG_DIR="$TMP/logs" \
PORT=11001 \
bash "$ALT_ROOT/scripts/t1.sh"

grep -q "NODE:.*$ALT_ROOT/src/server.js" "$TMP/state/derived.log"
grep -q 'OPEN:' "$TMP/state/derived.log"
