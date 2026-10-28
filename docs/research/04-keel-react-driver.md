# Keel React driver — what exists today

Source of truth: `/Users/ravonus/dev/keel-engine/packages/react/` (`@keel-engine/react`, ~180 lines). Not a separate repo.

## Files
- `src/index.mjs` — React components/hooks; `src/index.d.ts` — public types
- `src/lifecycle.mjs` — store, frame loop, `integerFit` (framework-free)
- `src/design.ts` — design language + theme tokens; `src/styles.css`; `src/bundle.mjs` (esbuild alias)
- `src/mcp.mjs` — MCP tools `keel-react-catalog|plan|scaffold|theme` (plugin `keel/react`, schemas in `schemas/tools.json`)
- `examples/KeelDemo.tsx` — scaffold template
- Engine: `packages/runtime/src/engine.ts` (module registry), `packages/render/src/pixel-renderer.ts` (WebGL2 raymarched pixel renderer), `packages/ui/src/theme.ts` (seeded theme generator), `packages/ui/src/present.ts` (canvas/GL presenters)
- `/Users/ravonus/dev/keel-pixel-engine` is separate/older and not used by the adapter.

## Architecture
- **Catalog:** static — returns `DESIGN_LANGUAGE`, tool schemas, package name, README path. No per-component manifest or slot/layout schema.
- **Plan → scaffold:** `plan()` (`mcp.mjs:14-23`) validates brief + assets, returns `keel-react-plan@1` (theme, fixed module list runtime/core/render/ui, capture rules `?cinematic=1`, acceptance gates: StrictMode, hydration, integer scale, same seed+frame ⇒ same pixels). Brief is echoed, not used. `scaffold` (`mcp.mjs:35-43`) string-replaces the recipe into `KeelDemo.tsx`, writes with `wx`, rolls back on failure.
- **Theme:** recipe `{seed, culture, pins}` → `themeOf` (`ui/src/theme.ts:288`) → OKLCH ramps, frame style, type scale, spacing, motion → `themeTokens()` (`design.ts:10-19`) → `--keel-*` CSS vars × integer scale, scoped on `[data-keel-theme]`.
- **Surfaces:** only `KeelCanvas`: fresh canvas per mount, `createPixelRenderer`, fixed-fps `createFrameLoop`; user `setup(renderer, canvas) → cleanup?` and `draw(renderer, {frame, seconds, delta})`. No 2D path, no surface registry, no layout slots, no auto resize.
- **Runtime:** `KeelProvider` starts one `createEngine()` (WeakMap guard for StrictMode); `useKeelModule(id)` → `engine.get(id)`.
- **Cleanup:** dispose loop → user cleanup → `WEBGL_lose_context` → remove canvas.
- **SSR:** `"use client"`, canvas created in `useEffect`, store `getServerSnapshot` returns initial value.

## Public API (`src/index.d.ts`)
- `KeelProvider{engine?, onError?}`, `useKeelEngine()`, `useKeelModule<T>(id)`
- `KeelCanvas{width,height,scale,fps,playing,label,setup,draw,onReady,onError}`; `CanvasHandle{canvas,renderer,clock}`
- `FrameClock{start,pause,seek,dispose,frame}`, `FrameTime{frame,seconds,delta}`
- `KeelStore<T>`, `integerFit`, `InspectionProbe.register(id, 'mesh'|'graph'|'grid'|'state', read)`
- `KeelTheme`, `KeelPanel`, `KeelButton`, `useKeelTheme`
- `PixelRenderer`: `setPalette, setMaterials, setStyle, setWorld, setFx, setMesh, render, read, offPalette`
- Engine: `define(manifest, factory)`, `resolve()`, `start()`, `get(id)`

## Reusable vs React-only
- **Reusable unchanged:** `lifecycle.mjs`, `design.ts`, `styles.css`, `bundle.mjs`, all engine packages, most of `mcp.mjs`.
- **React-only:** `index.mjs` (context + 3 effects per canvas).
- **React pain points:** 3 `useEffect`s in `KeelCanvas` (`index.mjs:32,42,43`), `latest` ref to dodge stale closures, inline `setup` rebuilds the GL context each render (demo hoists it to module scope), `playing` effect re-runs on resize, runtime provider errors, StrictMode start-once guard, ref gymnastics for inspection probes.
- **In a fine-grained framework:** one mount function + `onCleanup`; `playing/scale/label` are signals bound straight to clock and styles; no re-renders.
- **Missing for an agent pipeline:** declarative surface catalog, slot/layout schema, 2D surfaces, auto resize, brief-driven planning.

## Existing design language
- `keel/react-design@1` (`design.ts:4-9`): engine owns the scene, host only binds state; controls stay on authored world surfaces; integer scale + nearest sampling; project-owned fonts/assets; explicit seed + frame clocks.
- Theme recipe cultures: industrial, organic, crystalline, arcane, brutal, clean. Pins: tone, hue, accentHue, corner, border, bevel, fill, shadow, glow, motion, body, unit, caps…
- Ramps: surface(6), ink, accent, good, warn, bad, team[], outline, onAccent.
- Tokens: `--keel-surface|raised|ink|muted|accent|on-accent|outline|good|warn|bad|px|border|pad|gap|body|motion|font` + `--keel-{ramp}-{i}`.
- Retained pixel UI layer `ui/src/ui.ts`, presented via `createCanvasPresenter` / `createGlPresenter`.
