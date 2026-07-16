#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
DIR="$TMP/.config/terminal-workspace/hooks/terminalone/pre-start.d"
mkdir -p "$DIR"
cat > "$DIR/10-proof" <<'EOF'
#!/bin/bash
read -r payload
printf '%s\n' "$payload" > "$HOOK_RECEIPT"
EOF
chmod +x "$DIR/10-proof"
HOME="$TMP" HOOK_RECEIPT="$TMP/receipt.json" "$ROOT/scripts/run-hooks" pre-start
python3 - "$TMP/receipt.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert (d["product"], d["event"], d["schemaVersion"]) == ("terminalone", "pre-start", 1)
PY
