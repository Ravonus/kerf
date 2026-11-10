# Changelog

Every `@weft-js` package is released together, at one version. Early releases (0.1.x) can change APIs between
minor versions.

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
