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
crates/weft-layout      Taffy flexbox behind a C ABI; the same exports build to wasm for Node
```

## Run

```bash
cd spikes/native/js && pnpm install && npx vitest run      # fast lane, no simulator
cd crates/weft-layout && cargo test                         # layout crate
spikes/native/scripts/ios.sh "iPhone 17 Pro"               # build + launch on a simulator
```

Compare the phone's layout with Node's: the app writes `Documents/frames.json` 2 s after launch.

```bash
cd spikes/native/js && npx tsx ../scripts/compare-layout.mts <path to frames.json>
```

## Results (2026-10-28, iPhone 17 Pro simulator, iOS 26.2, Debug build)

| Exit check (09 §12) | Result |
|---|---|
| v3 list screen runs on iOS | ✅ 150 products, filters, sort, search, cart, live prices on real `UIButton` / `UITextField` / `UIScrollView` |
| Price push ≤ 1 host op | ✅ **1 op, 24 bytes**, 0.6–1.9 ms on the main thread including a full re-layout of 769 nodes. Same in the fast lane (test asserts it), with the `{...p}` update habit that cost Solid 300 DOM writes in v3 |
| Node layout matches device within 1pt | ✅ **0 pt** max difference over all 769 nodes, when Node uses the device's leaf measurements. With its own rough text metrics Node is approximate, as designed |
| Android | ⏳ not started (toolchain present: SDK 35–37, NDK 28, Rust Android targets) |
| 60 Hz on a mid-range Android | ⏳ needs the Android host |

Other numbers: first mount is 3,369 ops / 63 KB in one batch, 57 ms on the main thread (Debug, no incremental
layout yet). The device bundle is 4.8 KB brotli minified (runtime + app + alien-signals).

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
4. **Taffy 0.15's root sizing:** a flex root with an auto size shrinks to its content, so `compute()` pins the root to
   the screen.

## Not done / next

- Android host (Kotlin + JNI to weft-layout + a JS engine; Hermes or QuickJS).
- Hermes instead of JavaScriptCore on iOS (open question in 09 §13); bytecode precompile.
- Incremental layout: only re-lay out dirty subtrees, and skip frame writes for unchanged views.
- `<List>` virtualization (all 150 rows are real views today).
- Dev socket for `weft device snapshot/act` instead of the frames file.
