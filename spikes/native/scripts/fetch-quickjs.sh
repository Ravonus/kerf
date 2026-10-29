#!/usr/bin/env bash
# Fetches the pinned QuickJS-ng release used by the Android host (MIT). The checkout is git-ignored.
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)/android/third_party/quickjs"
tag="v0.17.0"
if [ -f "$dir/quickjs.h" ] && [ "$(git -C "$dir" describe --tags 2>/dev/null)" = "$tag" ]; then exit 0; fi
rm -rf "$dir"
git clone -q --depth 1 --branch "$tag" https://github.com/quickjs-ng/quickjs.git "$dir"
echo "quickjs-ng $tag at $dir"
