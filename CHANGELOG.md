# Changelog

Every `@weft-js` package is released together, at one version. Early releases (0.1.x) can change APIs between
minor versions.

## Unreleased

### Packages

- New: `@weft-js/scroll`, custom scrollbars over real scroll offsets, so find-in-page, anchors, sticky
  positioning, screen readers and `scroll` listeners keep working. In native mode, the default, the browser scrolls
  the area with its own bar hidden and a CSS scroll timeline moves the thumb, so neither waits for a busy main
  thread. Engine mode runs wheel, trackpad, touch (with inertia and overscroll), nested hand-off and selection
  autoscroll in JavaScript, the same in every browser. Keys, snap points and the API work in both. Bars are drawn in
  the DOM or, with `@weft-js/scroll/canvas`, on a canvas, and take a fixed-size thumb, colours, widths, auto-hide,
  overlay or gutter.
- `@weft-js/warp`: `ScrollView`, the Weft component over `@weft-js/scroll`, with a docs page and examples.

## 0.1.3 (2026-11-10)

### Packages

- The add-ons are released with the framework again, at 0.1.3: `text`, `pay`, `multiplayer`, `plugin-media`,
  `plugin-media-ffmpeg`, `plugin-surface-keel` and the six `realtime-*` buses. `npm create @weft-js --template landing`
  installs, since it needs `text` and `plugin-media`.
- `@weft-js/warp-core` marks `@weft-js/core` as an optional peer, as intended. It named the old package before.

### Docs

- Every package has a full README: what it's for, setup, the API in tables, real examples, troubleshooting and links
  to npm and the source. The compiler addons, the crates, the examples, the site and the scripts have one too.
- `packages/README.md` lists every package, and the root README lists the add-ons.

### Release

- `scripts/release.mjs` publishes without asking for a one-time code it doesn't need (`WEFT_OTP`), and a re-run skips
  what npm already has or is still processing.

## 0.1.2 (2026-11-09)

### Compiler

- New diagnostics for the mistakes agents make most:
  - state written inside `derived`;
  - a `watch` that only copies a value, or writes its own source;
  - reactive reads in async callbacks;
  - early returns from component setup;
  - numeric `&&` in JSX;
  - locals that event handlers change but nothing renders;
  - box and value prop mismatches;
  - module state a server can reach.
- Prebuilt native compilers for seven platforms:
  - macOS on Apple silicon and Intel;
  - Linux x64 and arm64, on both glibc and musl;
  - Windows x64.

  Everywhere else runs the WASM build, which gives the same output. A native compiler that is missing, a different
  version or fails to load falls back to WASM by itself.

### Start

- Islands take turns, and islands that hold only Warp components wait until they're needed. On the docs site, the
  islands that load with the page went from 212 to 62, and the landing page's blocking time went to 0.
- Pages whose code waits let the browser prefetch a hovered link (speculation rules).
- Cross-page view transitions that the browser skips no longer surface as errors in the page.
- `weft check` reads `.env`, so its route checks run.

### Warp

- Theme anything from one `warp()` config: colors, systems, parts and themes.
- The Theme studio: presets, trying a theme on the page, and copying the config.
- Toasts stay on top on every page, and a page shows one Toaster's list at a time.
- Warp's icons resolve in a pnpm app that lists only `@weft-js/warp`.

### Create

- A pnpm app installs and checks clean.
- Templates and the todo app use Warp components.

### Docs

- New READMEs for every package, and the docs match what 0.1.2 does.
- Each package links back to its source on GitHub.

## 0.1.1 (2026-11-03)

- Every `@weft-js` package, with the deploy and realtime work since 0.1.0.

## 0.1.0 (2026-11-01)

- The first release under the `@weft-js` scope.
