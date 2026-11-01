#!/bin/sh
# Two copies of the addon, v1 and v2, next to this script.
set -e
cd "$(dirname "$0")/addon"
for v in v1 v2; do
  SPIKE_VERSION=$v cargo build --release
  cp target/release/libreload_spike.dylib ../$v.node 2>/dev/null || cp target/release/libreload_spike.so ../$v.node
done
