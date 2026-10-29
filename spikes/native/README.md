# Native spike (phase 6a)

Throwaway code that tests the architecture in [research 09](../../docs/research/09-native-targets.md) before any of it
becomes a package. The weft compiler doesn't exist yet, so the app is written in **lowered form**
([`js/src/app.ts`](js/src/app.ts)): the `el`/`list`/`match` calls the `native` backend would emit for
[`app.source.tsx`](js/src/app.source.tsx). Only [`crates/weft-layout`](../../crates/weft-layout) is meant to survive.

```
protocol/ops.json ── gen-protocol.mjs ──► js/src/protocol.gen.ts · ios/Sources/Protocol.gen.swift · weft-layout/src/protocol.rs
js/src/runtime.ts       state/derived on alien-signals; bindings → ops; keyed list with LIS moves; one batch per flush
js/src/ops.ts           op encoder (no TextEncoder: bare engines lack it) + reference decoder
js/src/recording-host.ts  fast-lane host: decodes ops, lays out with weft-layout as wasm, role/label queries
ios/Sources/            Swift host: JavaScriptCore on its own queue, UIKit views, weft-layout static lib
android/app/src/main/   Kotlin host: QuickJS-ng on a HandlerThread (C JNI bridge), framework views, weft-layout via JNI
crates/weft-layout      Taffy flexbox behind a C ABI; the same exports build to wasm for Node
```

## Run

```bash
cd spikes/native/js && pnpm install && npx vitest run      # fast lane, no simulator
cd crates/weft-layout && cargo test                         # layout crate
spikes/native/scripts/ios.sh "iPhone 17 Pro"               # build + launch on a simulator
spikes/native/scripts/android.sh                            # build + launch on a running arm64 emulator
```

Compare the phone's layout with Node's: the app writes `frames.json` 2 s after launch (iOS: the app container's
`Documents/`; Android: `adb shell run-as dev.weft.spike cat files/frames.json`).

```bash
cd spikes/native/js && npx tsx ../scripts/compare-layout.mts <path to frames.json>
```

## Results (2026-10-28, Debug builds)

Devices: iPhone 17 Pro simulator (iOS 26.2) and an arm64 Android 16 emulator (API 36, 1080×2400 @ 420 dpi).

| Exit check (09 §12) | iOS | Android |
|---|---|---|
| v3 list screen runs | ✅ `UIButton` / `UITextField` / `UIScrollView` | ✅ framework `Button` / `EditText` / `ScrollView` |
| Price push ≤ 1 host op | ✅ **1 op, 24 bytes**, 0.6–1.9 ms main thread | ✅ **1 op, 24 bytes**, 1.4–2.7 ms main thread |
| Node layout matches device within 1pt | ✅ **0 pt** over 769 nodes | ✅ **0 pt** over 769 nodes |
| Fast typing keeps every key | ✅ (after the fix below) | ✅ `adb input text` burst |
| 60 Hz on a mid-range Android | — | ⏳ needs a real device and a frame-timing probe |

Both phones get the same op stream from the same 28 KB bundle (4.8 KB brotli minified). The engines differ
(JavaScriptCore on iOS, QuickJS-ng on Android) and the app doesn't notice. First mount is one batch of 3,369 ops /
63 KB: 57 ms on iOS, 328 ms on Android, where every text leaf goes through `View.measure` (no caching or
incremental layout yet). The Android APK is 5.2 MB; 2.6 MB of it is QuickJS + weft-layout in one `.so`.

## What the spike found

1. **Fast typing lost characters** ("bagel" → "Ba"). Late JS echoes of earlier keystrokes overwrote the field. Fix,
   now in both hosts: the host keeps the texts it reported that JS hasn't echoed yet; a JS value matching one is an
   echo and is dropped, anything else is a real JS write and wins. The fast lane only caught this after the recording
   host got a lag mode (`hold`/`releaseOne`); the test fails with the naive rule ("bgl") and passes with the fix.
   A real protocol should tag input events with a sequence number instead of matching strings.
2. **A growing container must be allowed to shrink.** With CSS's automatic min size, the list pushed its scroll view
   to 8,000 pt and nothing scrolled. `grow > 0` now implies a min size of 0 in weft-layout. The Node test caught it
   first; the device/Node comparison then caught a stale iOS build of the lib.
3. **Bare engines are not browsers.** JavaScriptCore without WebKit has no `TextEncoder`, `structuredClone`, timers
   or `console`. The host provides timers; the runtime must not assume web APIs.
4. **Android needed nothing new in JS.** The same bundle, op stream and echo rule worked on a different engine and
   view system; the host was ~400 lines of Kotlin plus ~250 of C. The only host bug was load order (`Renderer` used
   the JNI library before `JsRuntime` loaded it).
5. **Taffy 0.15's root sizing:** a flex root with an auto size shrinks to its content, so `compute()` pins the root to
   the screen.

## Not done / next

- One engine on both platforms (Hermes, or QuickJS everywhere) and bytecode precompile (09 §13).
- Android first-mount cost: cache text measurements and lay out only dirty subtrees.
- Incremental layout: only re-lay out dirty subtrees, and skip frame writes for unchanged views.
- `<List>` virtualization (all 150 rows are real views today).
- Dev socket for `weft device snapshot/act` instead of the frames file.
