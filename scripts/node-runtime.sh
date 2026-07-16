#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
EXPECTED_MAJOR="${TERMINALONE_NODE_MAJOR:-22}"
NATIVE_MODULES=(node-pty)

resolve_node() {
  local candidate major
  for candidate in "${TERMINALONE_NODE:-}" "$(command -v node 2>/dev/null || true)" /usr/local/bin/node /opt/homebrew/bin/node; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    major="$($candidate -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
    if [ "$major" = "$EXPECTED_MAJOR" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  echo "TerminalOne requires Node $EXPECTED_MAJOR.x. Set TERMINALONE_NODE to its absolute path." >&2
  return 1
}

NODE_BIN="$(resolve_node)"
export PATH="$(dirname "$NODE_BIN"):$PATH"

verify_native_modules() {
  (cd "$ROOT" && "$NODE_BIN" - <<'NODE'
require('node-pty');
NODE
  ) >/dev/null 2>&1 || return 1
  local helper found=false
  for helper in "$ROOT"/node_modules/node-pty/prebuilds/*/spawn-helper; do
    [ -e "$helper" ] || continue
    found=true
    [ -x "$helper" ] || return 1
  done
  $found
}

repair_native_modules() {
  local npm_bin
  npm_bin="$(command -v npm 2>/dev/null || true)"
  [ -n "$npm_bin" ] || { echo "npm is required to rebuild TerminalOne native modules." >&2; return 1; }
  (cd "$ROOT" && "$npm_bin" rebuild "${NATIVE_MODULES[@]}")
  for helper in "$ROOT"/node_modules/node-pty/prebuilds/*/spawn-helper; do
    [ ! -f "$helper" ] || chmod +x "$helper"
  done
  verify_native_modules
}

case "${1:-doctor}" in
  path)
    printf '%s\n' "$NODE_BIN"
    ;;
  doctor)
    printf 'node=%s version=%s abi=%s\n' "$NODE_BIN" "$($NODE_BIN -v)" "$($NODE_BIN -p 'process.versions.modules')"
    if verify_native_modules; then
      echo "native_modules=ok"
    else
      echo "native_modules=abi-mismatch; run: scripts/node-runtime.sh repair" >&2
      exit 1
    fi
    ;;
  repair)
    repair_native_modules
    echo "native_modules=repaired"
    ;;
  exec)
    shift
    verify_native_modules || {
      echo "TerminalOne native modules do not match $($NODE_BIN -v). Run: scripts/node-runtime.sh repair" >&2
      exit 70
    }
    exec "$NODE_BIN" "$@"
    ;;
  run)
    shift
    verify_native_modules || {
      echo "TerminalOne native modules do not match $($NODE_BIN -v). Run: scripts/node-runtime.sh repair" >&2
      exit 70
    }
    exec "$@"
    ;;
  *)
    echo "Usage: $0 {path|doctor|repair|exec NODE_ARGS...|run COMMAND...}" >&2
    exit 64
    ;;
esac
