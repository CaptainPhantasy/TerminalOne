#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
for helper in "$ROOT"/node_modules/node-pty/prebuilds/darwin-*/spawn-helper; do
  [ ! -f "$helper" ] || chmod +x "$helper"
done
