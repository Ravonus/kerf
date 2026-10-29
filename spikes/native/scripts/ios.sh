#!/usr/bin/env bash
# Builds and launches the spike on an iOS simulator: protocol → Rust lib → JS bundle → Xcode project → app.
# Usage: scripts/ios.sh [simulator name or UDID]   (default: "iPhone 17 Pro")
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$here/../.." && pwd)"
device="${1:-iPhone 17 Pro}"

node "$here/scripts/gen-protocol.mjs"
(cd "$repo/crates/weft-layout" && cargo build -q --release --target aarch64-apple-ios-sim --target wasm32-unknown-unknown)
(cd "$here/js" && pnpm install --silent && node bundle.mjs)
(cd "$here/ios" && xcodegen generate -q && xcodebuild -project WeftSpike.xcodeproj -scheme WeftSpike -configuration Debug \
  -derivedDataPath build -destination "platform=iOS Simulator,name=$device" build -quiet)

xcrun simctl boot "$device" 2>/dev/null || true
xcrun simctl install "$device" "$here/ios/build/Build/Products/Debug-iphonesimulator/WeftSpike.app"
xcrun simctl launch --terminate-running-process "$device" dev.weft.spike
echo "log: $(xcrun simctl get_app_container "$device" dev.weft.spike data)/Documents/weft.log"
