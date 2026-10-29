#!/usr/bin/env bash
# Builds and launches the spike on a running Android emulator or device (arm64):
# protocol → QuickJS source → Rust lib → JS bundle → Gradle → install → launch.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$here/../.." && pwd)"
sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ndk="$sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/darwin-x86_64/bin"

node "$here/scripts/gen-protocol.mjs"
"$here/scripts/fetch-quickjs.sh"
(cd "$repo/crates/weft-layout" && CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$ndk/aarch64-linux-android26-clang" \
  AR="$ndk/llvm-ar" cargo build -q --release --target aarch64-linux-android --target wasm32-unknown-unknown)
(cd "$here/js" && pnpm install --silent && node bundle.mjs)
[ -f "$here/android/local.properties" ] || printf 'sdk.dir=%s\n' "$sdk" > "$here/android/local.properties"
(cd "$here/android" && ./gradlew :app:assembleDebug -q --console=plain)

adb="$sdk/platform-tools/adb"
"$adb" install -r -t "$here/android/app/build/outputs/apk/debug/app-debug.apk" >/dev/null
"$adb" shell am start -W -n dev.weft.spike/.MainActivity >/dev/null
echo "log: adb shell run-as dev.weft.spike cat files/weft.log"
