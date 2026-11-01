# 09 — Native targets: iOS and Android from the same TSX

Research date: 2026-10-28. Statements marked **(unverified)** could not be confirmed from a primary source on that
date. Budgets marked **(proposed)** are starting points to be replaced by the first measurement.

**Question:** can one weft codebase, written in plain TSX, ship a web app, a native iOS app and a native Android app
through one pipeline? "Native" means real platform views and controls (UIKit/SwiftUI, Android Views/Compose), not a
webview and not a canvas that imitates them. Anything that can be shared should be, even when the platforms do it
completely differently underneath. Anything that can't be shared should be easy to add, and easy to split and keep
organised. And it has to work for agents first. Payments are covered separately in [10](10-payments.md).

---

## TL;DR

1. **weft's model makes a native renderer unusually cheap.** Components run once and updates land at the leaf, with
   no VDOM to diff. A native target is therefore the same graph driving a different set of leaf operations: create
   view, set property, insert, remove. Solid's universal renderer (`solid-js/universal`, `createRenderer`) is the
   proof that this backend swap works for a fine-grained compiler. Snap's Valdi (TSX compiled to native views, MIT,
   open-sourced in beta) and ByteDance's Lynx (native components, dual-thread) are the proof that TSX-to-native works
   at production scale.
2. **Architecture: one graph, three hosts.**
   - The compiler gets a third backend, `native`, next to `dom` and `ssr`, behind the same pre-pass and diagnostics.
   - App logic runs in Hermes (bytecode, precompiled) on a JS thread. Each `flush()` writes one batch of host ops into
     a shared buffer, and the main thread applies it. That is one crossing per frame, not per property.
   - Two thin hosts, Swift (iOS) and Kotlin (Android), own the real views.
   - Layout is one Rust crate (`weft-layout`, on Taffy) compiled into both hosts **and** into Node, so `weft test`
     computes the same frames the phone does, with no simulator.
3. **The vocabulary is already closed, which is what makes sharing possible.** warp/ds code uses `Stack Row Grid …`
   and intent props, never raw pixels or `<div>`. Those map to native. HTML intrinsics in a shared file become a
   compile error (N001) with the primitive to use instead. Most warp code is portable as written.
4. **"It knows what you'd like" is a deterministic resolution table, not a guess.** Each component resolves per
   platform through one app-level dial, `idiom: 'system' | 'blend' | 'brand'` (default `blend`). In `blend`, chrome
   goes system (navigation, tab bars, sheets, alerts, pickers, share) and content stays warp (fields with the sweep,
   cards, buttons, data). `weft design explain <Component> --platform ios` prints why something resolved the way it
   did, and the MCP server exposes the same answer.
5. **Splitting is a ladder, cheapest rung first:** token → prop value → inline branch → variant file
   (`Checkout.ios.tsx`) → route layout. Variants must keep the base's props type (N020). `weft split` creates them,
   `weft splits --json` lists them with their drift, and `weft check` on a diff flags a base change that its variant
   didn't follow (N022).
6. **Capabilities are typed, reactive values in `weft/device`**, the native sibling of `weft/browser`. Each has a
   per-target support entry. Using one that a target lacks from shared code is a type error with a fix (guard with
   `device.has()` or split). Declared permissions generate `Info.plist` and `AndroidManifest.xml`; an undeclared one
   is N030.
7. **What can't overlap still gets one contract.** Native modules are declared with Zod (methods, events, embeddable
   views). weft generates the Swift protocol, the Kotlin interface and the TS binding, the same way Rust gets types
   from `.weft/contract.json` (PLAN §4.3). Widgets and Live Activities start as native-only, then move to a small
   TSX subset compiled to SwiftUI and Glance.
8. **Agents drive the device like the browser.** `weft device` mirrors `weft browser`: `snapshot` returns the
   accessibility tree, laid-out frames **and** the live reactive graph from the running app; `act` works by role and
   label; `screenshot`, `time` and `set` work the same. The same `weft/test` files run in a fast lane (recording host
   + Node layout), and on a simulator or emulator.
9. **No hand-edited Xcode or Gradle projects.** `weft.config.ts` has an `app` block. `ios/` and `android/` are
   generated into `.weft/native/` and never committed (Expo's Continuous Native Generation idea). Typed overlays in
   `native/` are the only escape hatch, and editing a generated file is P010.

---

## 1. Prior art

| Project | How it renders | What weft takes | What weft avoids |
|---|---|---|---|
| React Native (New Architecture) | JS (Hermes) → Fabric → native views; JSI for sync calls | Hermes, bytecode precompile, the `.ios.tsx`/`.android.tsx` file convention (agents already know it) | React's re-render model, a reconciler on the JS side, Metro |
| Expo | RN plus Continuous Native Generation, config plugins, file routes, EAS builds | Generated native projects from config, typed config plugins | Hosted build service as a requirement |
| Valdi (Snap) | TSX components compiled to native iOS/Android/macOS views, no bridge, view pooling, only on-screen views rendered. MIT, beta | Evidence that TSX → native views works at Snap scale; view pooling; embedding native views inside and vice versa | Its own component model (weft keeps its graph) |
| Lynx (ByteDance) | Native components; UI thread (PrimJS) and background JS thread in parallel. Embedded into a host app; doesn't scaffold standalone apps | Dual-thread split: UI never waits on app logic | Embedding-only workflow, its own CSS engine |
| `solid-js/universal` | `createRenderer` with `createElement`, `setProperty`, `insertNode`… for any host | The exact op set a fine-grained compiler needs | — |
| NativeScript | JS calls native APIs directly; Solid and others have renderers | Direct-API escape hatch idea | Per-call bridging cost on hot paths |
| Flutter / Compose Multiplatform for iOS | Draws its own pixels (Skia/Impeller) | — | Not native controls: accessibility, text input, IME, autofill and system look must be re-implemented. Fails the "native" requirement |
| Capacitor / Tauri mobile | Webview | Possibly a later `--target webview` for quick wrapping | Not native |
| Skip, Kotlin Multiplatform | Source translation (Swift → Kotlin) or shared Kotlin | — | Not TSX; general-purpose logic can't be transpiled safely into idiomatic SwiftUI/Compose |

The bet: run TS logic in a JS engine, render real native views, and share layout in Rust. That is the Valdi/Lynx
shape with weft's compiler and graph on top.

## 2. Architecture

```
 app.tsx ─► weft-compiler ──┬─ dom backend ─► Vite ─► web bundle (unchanged)
                            ├─ ssr backend ─► Nitro
                            └─ native backend ─► Rolldown ─► hermesc ─► app.hbc
                                                                   │
  ┌─────────────────────────── device ─────────────────────────────┴─────────┐
  │  JS thread (Hermes)                     main thread (host)                │
  │  weft runtime + graph ──flush()──► op buffer ──► Swift host  (UIKit)      │
  │        ▲                         (SharedArrayBuffer,  Kotlin host (Views) │
  │        │                           1 crossing/flush)        │            │
  │        └──── batched events ◄──────────────────────────────┤            │
  │                                    weft-layout (Rust/Taffy) ◄┘ frames     │
  └──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Ops, not a bridge per property

- The native backend emits the same binding structure as the DOM backend, but against a host interface:
  `create(type)`, `set(node, prop, value)`, `insert(parent, node, before)`, `remove(node)`, `listen(node, event)`.
- The runtime writes ops into a typed buffer during the reactive update. `flush()` (already the microtask batch
  point, PLAN §3.1) hands the buffer to the host in one call. The host applies it on the main thread inside one
  layout pass.
- Events come back as batched messages and run as ordinary handlers. Their writes produce the next op batch.
- `toTouchAtMost(n)` (PLAN §3.7) counts host ops instead of DOM mutations. The same test asserts the same budget on
  all three targets.

### 2.2 Threads and the things that must not wait for JS

The UI thread must never block on app logic, and some interactions can't take a JS round trip.

- **Animations and gestures:** `warp-core/motion` presets are declarative (spring, duration, curve), so they lower to
  Core Animation and Android animators running on the UI thread. JS only starts them and hears when they end.
  Drag-to-dismiss, swipe actions and pull-to-refresh are host behaviours with declarative props, not JS-driven
  frames. No worklets in v0.
- **Scroll-linked effects** (collapsing headers, sticky parts) are declared as bindings to scroll position and run in
  the host.
- **Text input:** the native field owns its text and selection. `onInput` reports to JS. The host keeps the texts
  it reported that JS hasn't echoed back yet: a JS value matching one of them is a late echo and is dropped, and any
  other value is a real JS write and wins. This avoids the controlled-input cursor jump and lost keystrokes that
  React Native has had to work around. The spike lost characters with a simpler rule ([spike](../../spikes/native/README.md));
  the real protocol should tag input events with a sequence number instead of matching strings.

### 2.3 Layout: one Rust crate everywhere

- `crates/weft-layout` wraps Taffy (Rust flexbox, CSS grid and block layout). warp's layout primitives already
  compile to flex/grid on the web, so the same token-resolved styles feed Taffy.
- Text measurement is a callback into the platform (Core Text / Android `StaticLayout`) so wrapping matches what the
  platform actually draws. In Node, the fast test lane uses a font-metrics table. It is approximate by design and
  marked as such in the snapshot.
- The same crate is linked into the iOS host, the Android host (JNI) and Node (napi). `weft test` can assert
  `toFit()`, overflow, and ≥ 44pt hit targets without a device.
- **Rejected for v0:** delegating layout to SwiftUI stacks or Compose. The numbers would differ per platform and
  couldn't be tested headless. Native views embedded with `<Native>` (§6) still lay themselves out inside a Taffy
  box.
- Safe areas, the keyboard inset and display cutouts are live values in `weft/device` (`insets`, `keyboard`) that
  layout tokens can read. `<Screen>` applies them by default.

### 2.4 Lists

- `.map` with `key` stays the one way to write a list (PLAN rule 3). Inside `<List>`, the compiler lowers it to a
  virtualized host list: `UICollectionView` on iOS, `RecyclerView` on Android, and the warp virtual list on web.
- Each key keeps its own row subgraph while it is visible plus a buffer, and is disposed after. Recycled native cells
  are re-bound to a row subgraph; they are never re-created per scroll.
- A `.map` over more than ~50 rows in a plain `<Scroll>` gives a dev-time warning (N060) suggesting `<List>`. The row
  count is dynamic, so this can't be a compile error.

### 2.5 Engine

- **Hermes on both platforms.** It is React Native's default engine on iOS and Android, compiles to bytecode ahead of
  time (fast startup, no JIT, which iOS forbids for third-party code anyway), and has a debugging story agents can use
  through CDP.
- The runtime and compiler don't depend on Hermes specifics, so JSC on iOS and QuickJS remain possible fallbacks.
- Static Hermes (typed TS compiled to native code) is worth watching for hot paths later **(unverified status)**.

## 3. Compiler and build

- **Backends:** `weft-compiler` gets `target: 'dom' | 'ssr' | 'native'`. The pre-pass (props, lists, naming) and
  diagnostics are shared, so every W-code works the same on native.
- **Bundling:** Rolldown builds the native bundle (no Metro), then `hermesc` turns it into bytecode. One bundler
  everywhere, matching PLAN §3.6.
- **Platform constant:** `platform.os` from `weft/device` is `'web' | 'ios' | 'android'`, folded at build time so the
  dead branches vanish from each bundle.
- **File resolution:** `X.ios.tsx` → `X.android.tsx` → `X.native.tsx` → `X.web.tsx` → `X.tsx`, most specific first.
  This is React Native's convention, which is in every agent's training data.
- **Dev loop:** `weft dev --ios` / `--android` builds the debug host once, boots the simulator or emulator, and
  serves the bundle over the dev server. HMR uses the same name-keyed state preservation as the web.
- **Generated projects:** the `app` block of `weft.config.ts` (id, name, version, icons, splash, permissions with
  purpose strings, entitlements, URL schemes, associated domains) generates `.weft/native/ios` and
  `.weft/native/android`. They're regenerated on change and git-ignored.
  - Escape hatch: typed overlays in `native/ios/` and `native/android/` (Swift/Kotlin sources, extra plist or manifest
    keys, Gradle/SwiftPM dependencies).
  - Editing a generated file directly is **P010**.
- **Toolchain:** iOS builds need macOS with Xcode; Android builds run anywhere with the SDK. `weft doctor --native`
  checks both and prints exact fixes.

## 4. Vocabulary and the resolution table

### 4.1 What a shared file may use

- Layout primitives: `Stack Row Split Switch Grid Center Surface Frame`, plus `Scroll`, `List` and `Screen`.
- Text through `Text role=…`, `Image`, `Icon`.
- warp components and `warp-core` behaviours.
- HTML intrinsics (`div`, `span`, `input`…) only in files that resolve to web. Elsewhere they are **N001**: "`<div>`
  has no native equivalent. Use `<Stack>`," with an autofix for the common cases.
- CSS files and Tailwind classes are web-only. On native, styling comes from tokens and intent props, which is what
  warp already requires (PLAN §6, principle 6 in warp 00). A `class` attribute in a shared file is **N002**.

### 4.2 Resolution per platform

The app sets `idiom` once (`weft.config.ts` or `<App idiom>`). Any component can override it with an `idiom` prop.

| Component | web (warp) | iOS `system` | Android `system` | `blend` (default) |
|---|---|---|---|---|
| Stack / Row / Grid / Split / Center | flex / grid | Taffy-laid views | Taffy-laid views | same everywhere |
| Text roles | warp type scale | Dynamic Type styles | Material type roles + font scale | warp roles mapped onto Dynamic Type / font scale, so user text size always wins |
| Button | warp frame button | `UIButton` configuration | Material button | warp frame button, native press feedback and haptics |
| Input / Textarea | sweep field, floating or classic label | `UITextField` | Material text field | warp field drawn natively, **sweep and floating label kept**; the native text view inside keeps IME, autofill and selection |
| Select | warp select / popover | `UIMenu` or picker | exposed dropdown menu | system |
| Switch (toggle) / Segmented | warp | `UISwitch` / `UISegmentedControl` | Material switch / segmented button | system, tinted with accent |
| Date / time pickers | warp calendar | `UIDatePicker` | Material date/time pickers | system |
| Tabs (in-page) | warp tabs | segmented control | Material tabs | warp |
| App navigation | sidebar or top bar | `UINavigationController` + tab bar | navigation bar + bottom navigation | system |
| Modal / Drawer | `<dialog>` | sheet with detents | bottom sheet / modal | system sheet, warp content inside |
| Alert / confirm | warp dialog | `UIAlertController` | Material dialog | system |
| Toast | warp toast | warp toast (iOS has none) | Snackbar | warp on iOS, Snackbar on Android |
| Menu / context menu | warp menu | `UIContextMenu` | popup menu | system |
| Card, Badge, Stat, Alert, data, charts | warp | warp | warp | warp |
| Share, permission prompts, pickers for photos/files | Web Share, `<input type=file>` | system sheets | system sheets | always system |

- **Materials:** in `system` and `blend`, iOS chrome uses the platform's materials (Liquid Glass on iOS 26). Android
  can opt into Material dynamic color with `androidDynamicColor: true`.
- **Contrast still holds:** dynamic color replaces the seed at runtime, so the token expansion and contrast check
  (PLAN §6, warp `contrast-check`) run on device from the same code. A seed that can't pass falls back to the app's
  own seed.
- **The warp signature:** SIGNATURE.md makes the sweep non-negotiable for warp controls. In `blend` and `brand` it
  stays. `system` is an explicit choice not to use the warp skin for those controls, like `create-weft --ui
  headless`, and `weft check` reports it as such (D-code) instead of silently degrading.
- **How "what you'd like" is decided**, in order:
  1. the component's `idiom` prop;
  2. the app `idiom`;
  3. the component's class: chrome or content (see the table);
  4. the expression dial: `quiet` pulls metrics toward platform defaults, `vivid` toward warp;
  5. tokens pinned per platform (§5).

  `weft design explain Select --platform ios` prints that chain. MCP `catalog.resolve(component, platform)` returns
  it as JSON, so an agent can predict the result before building.

### 4.3 The window: size classes, folds and hinges

The platform is fixed per build; the window is not. Hosts report the window inside the safe area and system bars,
plus any fold or hinge that separates it, on start and on every change: rotation, unfolding, split screen and Stage
Manager. On Android that comes from Jetpack WindowManager's `FoldingFeature`, on the web from the Viewport Segments
API; iOS has no hinges. Components that adapt to the window add a step 3b to the order above, the **window class**:

| class | rule | example |
|---|---|---|
| compact | width < 600 | every phone in portrait |
| medium | 600–839 | Android phone in landscape, iPad mini portrait, open foldable |
| expanded | ≥ 840 | iPad landscape, tablets, desktop |
| dual | a separating fold or hinge | foldable half open, Surface Duo spanned |

The thresholds are Material's window size classes, shared because pt and dp are close. The table maps each class
per OS, so the same class can mean different things: compact and medium keep the tab bar on iOS, while Android
moves to a navigation rail at medium. `dual` overrides width and every idiom, because a hinge is a physical
constraint. Nothing is ever laid out under it, and content splits into panes exactly at its edges. Re-resolution
is live and keeps app state, since state lives outside the forms. Touch-target minimums are per platform too:
44pt on iOS, 48dp on Android.

The spike ([spikes/native](../../spikes/native/README.md)) checks this across a 25-window matrix
(`protocol/devices.json`, each entry marked measured, spec or approx) and on the real WindowManager stack of a
foldable emulator.

## 5. Splitting and keeping it organised

Each rung is cheaper to maintain than the next. Agents are told (AGENTS.md) to use the lowest rung that works.

| Rung | When | How |
|---|---|---|
| 0. Nothing | The resolution table already does what you want | — |
| 1. Token | One value differs (page gutter, title size) | `tokens.platform.ios.space.page = 'section'` in the theme |
| 2. Prop value | One prop on one element differs | `gap={platform.select({ ios: 'related', default: 'group' })}`, folded at build time |
| 3. Inline branch | A small piece exists on one platform | `{platform.os === 'android' && <BackHint />}`, dead-code eliminated |
| 4. Variant file | A component's structure differs | `Checkout.ios.tsx` beside `Checkout.tsx` |
| 5. Route layout | Navigation or shell differs | `routes/_layout.native.tsx`; or route meta `nav: { web: 'sidebar', native: 'tabs' }` |
| 6. Native-only feature | Can't exist elsewhere | `native/` module or extension (§6) |

**Variant rules (checked):**
- A variant exports the same names as its base, and each with an identical props type. Divergence is **N020**: the
  call sites are shared, so the contract must be too.
- Logic shared between variants goes in plain modules or a `derived`-returning helper. N021 flags a variant that is
  now byte-identical, or identical after formatting, to its base ("delete the variant").
- On a diff, if a base file changed and its variants didn't, `weft check` reports **N022** (info): "`Checkout.tsx`
  changed; `Checkout.ios.tsx` did not. Confirm the change doesn't apply there." This is the drift that bites
  multi-platform codebases, and the place an agent is most likely to forget.

**Tools:**
- `weft split Checkout --ios` copies the base into a variant and records the base hash.
- `weft splits --json` lists every variant, its rung, its size of difference from the base, and its drift status.
- `weft unsplit Checkout.ios.tsx` merges back when the difference is gone.

**Layout of a project:**

```
src/
  routes/            shared routes (file routes, PLAN §4)
    _layout.tsx      AppShell: sidebar on wide web, tabs on phones
    _layout.native.tsx   only if the native shell needs real structure changes
  components/
    Checkout.tsx
    Checkout.ios.tsx     variant beside its base, never in a separate tree
  server/            query / mutation / stream, unchanged
native/
  modules/scanner.ts  Zod contract for a native module
  ios/ScannerModule.swift
  android/ScannerModule.kt
  extensions/         widgets, live activities (§6.3)
weft.config.ts        app block: ids, icons, permissions, idiom
```

Variants live beside their base on purpose: an agent opening `Checkout.tsx` sees the sibling in the same directory
listing.

## 6. Capabilities, native modules, and what can't overlap

### 6.1 `weft/device`

Reactive values and async calls, owned and cleaned up like `weft/browser` (PLAN §4.2). Each entry has a support row,
and `device.has(x)` narrows the type.

| Capability | web | iOS | Android |
|---|---|---|---|
| `haptics` | — (no-op on web, typed as optional) | Core Haptics / feedback generators | `HapticFeedbackConstants` / Vibrator |
| `camera`, `photos` | `getUserMedia`, file input | AVFoundation, PHPicker | CameraX, Photo Picker |
| `biometrics` / passkeys | WebAuthn | LocalAuthentication, passkeys | BiometricPrompt, Credential Manager |
| `secureStorage` | — (use the server session) | Keychain | Keystore-backed storage |
| `notifications` | Web Push | APNs | FCM |
| `location` | Geolocation | Core Location | Fused Location |
| `share`, `clipboard`, `files` | Web Share, Clipboard, File System Access | share sheet, pasteboard, document picker | share intent, ClipboardManager, SAF |
| `links` | routes | universal links | app links |
| `insets`, `keyboard`, `appState`, `network` | partial | yes | yes |

- **Deep links come from routes.** File routes already know every path, so `weft/start` serves
  `apple-app-site-association` and `assetlinks.json` automatically, and the generated projects register the domains.
- **Push is one server call.** `notify(user, message)` in `weft/start` fans out to Web Push, APNs and FCM from stored
  device tokens. The client calls `notifications.register()`.
- **Permissions are declared once**, with purpose strings, in `weft.config.ts`. Using `camera` without declaring it
  is **N030**. Using a capability a target lacks, from a shared file without a `device.has()` guard, is **N031** with
  both fixes (guard, or move to a variant).

### 6.2 Native modules: one Zod contract, three bindings

```ts
// native/modules/scanner.ts
export const Scanner = nativeModule('scanner', {
  methods: { scan: { input: z.object({ formats: z.array(BarcodeFormat) }), output: Barcode } },
  events: { torch: z.boolean() },
  view: { props: z.object({ active: z.boolean() }) },   // optional embeddable view
  platforms: ['ios', 'android'],
})
```

- `weft build` generates a Swift protocol and a Kotlin interface to implement, plus the TS binding. Methods return a
  `Resource`, events are streams, and the view is used with `<Native use={Scanner.View} active={on.value} />`, laid
  out inside a Taffy box.
- Inputs are validated in TS before crossing; outputs are validated in dev and tests (the same rule as PLAN §4.2).
- A missing implementation for a listed platform is a build error (N040). Calling the module from a target it doesn't
  list is N031.
- The same mechanism wraps existing native SDKs, which is how the payment rails in [10](10-payments.md) are built.

### 6.3 Things that genuinely can't overlap

Home-screen widgets (WidgetKit / Glance), Live Activities and the Dynamic Island, App Intents/Siri and Android App
Actions, App Clips and Instant Apps, watch and Wear OS, CarPlay and Android Auto, share and notification extensions,
Android foreground services.

- **v0:** native-only, written in Swift/Kotlin under `native/extensions/`, talking to the app through a typed shared
  store (App Group / shared preferences) generated from a Zod schema.
- **Later, "make it work anyway":** WidgetKit (SwiftUI) and Glance (Compose) are both small declarative vocabularies:
  stacks, text, images, gauges, a timeline. A restricted TSX subset (no state, only props from a timeline entry)
  compiles to both. This is the same move as the main pipeline, applied to a smaller target. Anything outside the
  subset is a compile error pointing at the native-only path.

## 7. Data, auth and versions in the field

- `query`, `mutation`, `.live`, `stream` and `channel` work unchanged against the deployed `weft/start` origin. The
  client cache is the same code.
- **Auth:** cookies are replaced by a bearer session token (Better Auth supports this) kept in `secureStorage`. CSRF
  doesn't apply to bearer requests; the server keeps the Origin and session checks.
- **Transport:** SSE and WebSocket are provided by the host natively rather than relying on the engine's `fetch`
  streaming support **(unverified for Hermes)**.
- **Old builds live for months.** A web tab reloads; an installed app doesn't. `.weft/contract.json` is kept per
  released native build. `weft check` flags a breaking change to a server function that a shipped build still calls
  (**N050**), with the options: add a new version, keep the old shape, or set a minimum app version (the stale-schema
  check in PLAN §4.2 then forces an update prompt instead of failing silently).
- **Over-the-air JS updates** are a later feature and depend on store rules for interpreted code. Not in the first
  native phase.

## 8. The agent loop

- **`weft device`** = `weft browser` for the simulator or emulator, built on a dev socket in the debug host rather
  than XCUITest/Espresso, so it's fast and identical on both platforms.
  - `open <route>` (through deep links), `act <role> <name> tap|fill|swipe|long-press`, `assert`, `back`.
  - `snapshot`: accessibility tree with refs, **laid-out frames from `weft-layout`**, which platform resolution each
    component took (§4.2), and the reactive graph (`Cart.total = 42.5 ← …`).
  - `screenshot` (via `simctl` / `adb`, to a file), `logs` (source-mapped to component names), `time`, `set`.
  - `device rotate|appearance|text-size|locale` to check the cases that break native layouts.
  - The spike has the core of this: a debug-only socket in both hosts and in the Node recording host, with
    `snapshot`, `frames`, `tap`, `type` and `select` by label or id through the real controls. Replies wait for the
    app's next apply, and commands translate between platform forms (a segment on iOS, chips on Android). It drove
    a tabletop foldable end to end. One lesson: a recreated Android activity has to release the port, or the CLI
    keeps talking to the dead instance.
- **Tests, three lanes, same files:**
  - fast lane: a recording host plus `weft-layout` in Node, so layout and op budgets are asserted with no device;
  - `--native ios|android`: the real host on a simulator or emulator;
  - the gate (fail-before, mutation, T020) is unchanged.
- **Diagnostics** join the catalog as `N0xx` (§10), with `--json` and autofixes like every other code.
- **Keys stay with humans.** Signing, store upload and payment catalog sync are `tasks` with side effects
  `requires: human`. An agent can prepare a release; it can't sign or submit one.

## 9. Budgets (proposed, replace after the first measurement)

| Metric | Budget |
|---|---|
| Cold start to first screen, mid-range Android | ≤ 1.0 s **(proposed)** |
| Same, recent iPhone | ≤ 0.5 s **(proposed)** |
| Runtime + host overhead in the JS bundle | ≤ 15 KB brotli before app code **(proposed)** |
| Ops per interaction | the same `toTouchAtMost` numbers as web |
| 1k-row `<List>` fling | no dropped frames at 60 Hz in the perf lane |
| JS → host crossings | 1 per flush |

## 10. Diagnostic catalog additions

| Code | Catches | Fix |
|---|---|---|
| N001 | HTML intrinsic in a file that resolves to native | The layout primitive or component (autofix for common cases) |
| N002 | `class`/CSS in a shared file | Intent props or tokens; or move to a `.web.tsx` variant |
| N020 | Variant whose exports or props type differ from its base | Make the contracts match |
| N021 | Variant identical to its base | Delete the variant (`weft unsplit`) |
| N022 | Base changed on a diff, variant didn't (info) | Confirm or apply to the variant |
| N030 | Capability used but not declared in `app.permissions` | Add it with a purpose string |
| N031 | Capability or module unavailable on a target, used unguarded from shared code | `device.has()` guard, or a variant |
| N040 | Native module missing an implementation for a listed platform | Implement it, or remove the platform |
| N050 | Breaking change to a server function a shipped build still uses | New version, compatible shape, or minimum app version |
| N060 | Large `.map` in a plain `Scroll` (dev runtime) | `<List>` |
| P010 | Edited a generated native project file | Move the change to a `native/` overlay |

## 11. Risks

- **Two hosts are a permanent cost.** Every component needs a Swift and a Kotlin implementation. Mitigation: keep
  the host surface small (views, text, input, list, a dozen system controls) and push behaviour into shared JS and
  Rust.
- **Text input and IME** are the hardest part of every native framework. They need their own test suite on real
  keyboards (CJK, autocorrect, password managers).
- **Accessibility parity:** roles and labels from warp must map to UIAccessibility and Android semantics, and
  `weft device snapshot` reads them back from the platform, not from JS, so gaps show up.
- **Text measurement in Node** is approximate. Layout tests that depend on exact wrapping belong in the native lane.
- **App Review** rejects for reasons that aren't code. Payments are the main one ([10](10-payments.md)).

## 12. Phasing

| Phase | Ships | Exit check |
|---|---|---|
| **6a. Native spike (3 weeks)** | Hermes + op buffer + `weft-layout` + Swift and Kotlin hosts with `Stack Row Text Button Input Scroll`, `weft dev --ios/--android`, HMR | The v3 shop app's list screen runs on both platforms; price push is ≤ 1 host op; layout frames from Node match device within 1pt for non-text boxes. If the op-buffer model can't hold 60 Hz on a mid-range Android, stop and revisit. |
| **6b. warp native tier 1 + device** | The §4.2 table for tier-1 components, `idiom`, `weft/device` core set, generated projects, `weft device`, N-codes, split tooling | An agent takes a shared web app to both stores' TestFlight/internal track with ≤ 3 variant files, and `weft device snapshot` finds every element the tests need. |
| **6c. Payments** | [10](10-payments.md) | See there. |
| **6d. Extensions** | Native modules codegen, widget TSX subset | A widget written once in TSX ships on iOS and Android. |

## 13. Open questions

- Single JS engine (Hermes everywhere) or JSC on iOS to save binary size?
- Android host on Views or Compose? Views give finer control of recycling; Compose is where Material components and
  Glance live. Leaning Views for the core, Compose for system components through interop.
- macOS and iPadOS multi-window: Mac Catalyst, AppKit host, or out of scope?
- Is `blend` the right default for every app, or should `create-weft` ask?

## Sources

- Valdi: https://github.com/Snapchat/Valdi · README: https://cdn.jsdelivr.net/gh/snapchat/valdi@main/README.md ·
  coverage: https://itsfoss.com/news/snapchat-open-sources-valdi/ ·
  https://www.webpronews.com/snapchats-valdi-revolutionizing-cross-platform-ui-with-native-speed
- Lynx: https://thenewstack.io/cross-platform-ui-framework-lynx-competes-with-react-native/ ·
  https://www.pkgpulse.com/guides/lynx-bytedance-framework-vs-react-native-2026 ·
  https://www.courier.com/blog/why-bytedance-built-lynx-because-react-native-left-a-gap
- Solid universal renderer: https://github.com/solidjs/solid/tree/main/packages/solid/universal
- Taffy: https://github.com/DioxusLabs/taffy
- Hermes: https://github.com/facebook/hermes
- Expo Continuous Native Generation: https://docs.expo.dev/workflow/continuous-native-generation/
