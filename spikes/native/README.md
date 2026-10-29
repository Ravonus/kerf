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
protocol/idioms.json    which platform form each intent component takes, per OS × idiom × window class, with the reason
protocol/devices.json   25 real windows (phones, iPads, foldables, Duo, tablets, web) every test renders in
js/src/platform.ts      resolve() / explain() over that table; platform.os is a build-time constant per bundle
js/src/intents.ts       Choice and AppTabs: the app says what it means, the table picks the form
```

## Run

```bash
cd spikes/native/js && pnpm install && npx vitest run      # fast lane, no simulator
cd crates/weft-layout && cargo test                         # layout crate
spikes/native/scripts/ios.sh "iPhone 17 Pro"               # build + launch on a simulator
spikes/native/scripts/android.sh                            # build + launch on a running arm64 emulator
spikes/native/scripts/fold.sh create && spikes/native/scripts/fold.sh boot   # a foldable to test postures on
```

Compare the phone's layout with Node's: the app writes `frames.json` 2 s after launch (iOS: the app container's
`Documents/`; Android: `adb shell run-as dev.weft.spike cat files/frames.json`).

```bash
cd spikes/native/js && npx tsx ../scripts/compare-layout.mts <path to frames.json> <ios|android>
```

## Results (2026-10-28, Debug builds)

Devices: iPhone 17 Pro simulator (iOS 26.2) and an arm64 Android 16 emulator (API 36, 1080×2400 @ 420 dpi).

| Exit check (09 §12) | iOS | Android |
|---|---|---|
| v3 list screen runs | ✅ `UIButton` / `UITextField` / `UIScrollView` | ✅ framework `Button` / `EditText` / `ScrollView` |
| Price push ≤ 1 host op | ✅ **1 op, 24 bytes**, 0.6–1.9 ms main thread | ✅ **1 op, 24 bytes**, 1.4–2.7 ms main thread |
| Node layout matches device within 1pt | ✅ **0 pt** over 763 nodes (idiom build) | ✅ **0 pt** over 770 nodes (idiom build) |
| Fast typing keeps every key | ✅ (after the fix below) | ✅ `adb input text` burst |
| 60 Hz on a mid-range Android | — | ⏳ needs a real device and a frame-timing probe |

Before the idiom slice both phones got the same op stream from one 28 KB bundle (4.8 KB brotli minified). Now each OS
gets its own bundle (33 KB, 6 KB brotli minified) and a slightly different tree, because structure is decided per
platform at build time. The engines differ
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

## Platform idioms: one app, each platform's form

The app never names a platform. It uses intent components (`Choice`: "pick one of these"; `AppTabs`: "these are the
app's sections") and [`protocol/idioms.json`](protocol/idioms.json) decides the form for each OS × idiom:

| | web | iOS | Android |
|---|---|---|---|
| `Choice` (control) | warp buttons | `UISegmentedControl` | Material choice chips |
| `AppTabs` (chrome) | tabs in the header | bottom tab bar | bottom navigation bar |

- **The dial.** `system` uses each platform's own controls everywhere. `blend` (the default) uses them for controls
  and chrome but keeps the brand's colour, type and spacing. `brand` makes iOS and Android look like web.
  A component's own `idiom` prop beats the app idiom.
- **Two levels.** Structure (where the tabs go) is resolved in JS when the bundle is built, so each OS gets a
  different tree. Rendering (which control draws a choice) reaches the host as a node type or a `tone`, and the
  host draws it natively.
- **What links them.** Behaviour is shared. The same state, the same `onSelect` and the same tests drive a segmented
  control on iOS and chips on Android, and a price push is still 1 op on each.
- **For agents.** `resolve()` returns a decision chain, and `explain('Choice')` prints the whole table with its
  reasons, so an agent can predict the result before it builds. `resolve()` throws if the table picks a form that
  host can't draw.

Verified on both devices: the category and sort choices filter (bakery → 45 products), and adding to the cart and
switching tabs works (Bagel 10 × 1, Total $0.45, Cart (1)).

Layout always runs inside the safe area (and on Android the system bars and display cutout). A surface touching an
edge of it carries its background on to the screen edge there: under the home indicator, beside the Dynamic Island
in landscape, under the status bar for a sidebar or rail. Frames, and Node parity, don't change.

## Every window: phones, iPads, foldables, dual screens

The OS is fixed per bundle; the **window is live**. Hosts report it as `dispatch(0, 'viewport', {w, h, hinge?})` on
start and on every change (rotation, unfolding, split screen, Stage Manager), and the app mounts on the first report,
so a wide window never flashes the phone form. `platform.ts` turns it into a window class, with the same thresholds
as Material's window size classes (pt and dp are close enough to share them):

| class | when | iOS | Android | web |
|---|---|---|---|---|
| compact | width < 600 | tab bar | navigation bar | header tabs |
| medium | 600–839 | tab bar | navigation rail | header tabs |
| expanded | ≥ 840 | sidebar | navigation rail | header tabs |
| dual | a fold or hinge separates the window | two panes | two panes | two panes |

The same class maps to different forms per OS: an iPhone in landscape keeps its tab bar, as iOS does, while an
Android phone in landscape (864dp) gets a rail. `dual` wins over width, under every idiom including `brand`, because
a hinge is hardware, not style. The first two sections sit side by side, one per pane, split exactly at the hinge
(explicit widths in weft-layout are exact, so content can't be pushed under it), and the tab control goes away. A
vertical hinge (book posture, Surface Duo) splits into columns; a horizontal one (tabletop) into rows. App state lives
outside the sections, so changing form keeps filters, cart and the current tab.

Hinges come from Jetpack WindowManager (`FoldingFeature`, separating only). A flat fold isn't separating, so an open
foldable is one medium or expanded pane. iOS has no hinges. The minimum touch target is per platform as well: 44pt
on iOS, 48dp on Android.

**[`protocol/devices.json`](protocol/devices.json)** lists 25 windows, each with the form it must get and where its
numbers came from (`measured` on a simulator or emulator, `spec`, or `approx`): iPhone SE to 17 Pro Max in both
orientations, iPad mini to iPad Pro 13 (including Split View), small 3-button-nav Android phones, Pixel 8,
foldables folded, flat, in book and tabletop posture, Surface Duo, Android tablets, and web. `test/devices.test.ts`
renders the app in every one and checks the form, that nothing is off screen or under a hinge, touch targets, and
that filtering, adding and totals work. Live changes are tested too: a foldable going folded → open → book →
tabletop → folded with state kept, rotation, and a Surface Duo split at its 33.6dp hinge. `compare-layout` also
flags any button narrower than its label using the device's real text metrics, which caught a wrapped rail label that
Node's approximate metrics couldn't.

Verified on devices:
- iPhone 17 Pro in portrait and landscape (the tab bar spans the full width past the Dynamic Island).
- iPad Pro 13-inch in landscape: a sidebar, with selection moving on tap.
- Pixel 8 emulator: rotating switches the navigation bar to a rail live, keeping state.
- A foldable emulator (`scripts/fold.sh`) on the real WindowManager stack:
  - open flat (851.7dp) gives the rail;
  - half open, WindowManager reports `HALF_OPENED` at x=425.8dp and the app splits there, with products on one
    half and the cart on the other, updating live;
  - opening flat again returns to the rail with the cart kept.
- Layout parity is 0pt in every form checked: phone, landscape rail and book posture.

Gaps:
- The Surface Duo is covered by the fast lane only. Stock emulator images have no Duo overlay and Microsoft's Duo
  emulator is gone, so a dual-screen AVD reports no hinge.
- Tabletop posture is tested in Node only.
- A hand-made foldable AVD reports its fold as always FLAT until the Pixel 9 Pro Fold overlay is enabled
  (`scripts/fold.sh setup`).
- iOS doesn't rewrite `frames.json` on rotation yet, so landscape and iPad parity weren't measured.
- androidx.window pulls in androidx.core, and the debug APK went from 5.2 to 11.9 MB. R8 in a release build should
  strip most of it.
- esbuild doesn't fold the idiom table per OS, so each bundle carries every platform's rows. The compiler should fold
  `platform.os` and drop dead branches.

## Not done / next

- One engine on both platforms (Hermes, or QuickJS everywhere) and bytecode precompile (09 §13).
- Android first-mount cost: cache text measurements and lay out only dirty subtrees.
- Incremental layout: only re-lay out dirty subtrees, and skip frame writes for unchanged views.
- `<List>` virtualization (all 150 rows are real views today).
- Dev socket for `weft device snapshot/act` instead of the frames file.
