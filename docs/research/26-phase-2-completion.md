# 26. Finishing Phase 2: media, fonts, skeleton shapes, fluid type, `create-weft --ui`, X-codes

Status: **design 2026-10-29, built in the same change.** Inputs: PLAN §6.1–6.3 and the Phase 2 row of §9, research
11 (text and type, §7–8), 13 (plugins, §2–3), 15 (assets, §7–8) and 25 (routing; H-codes took research 20's M
numbers back, so `M0xx` is free for media).

Phase 2 already had the plugin API, warp-core, warp tier 1 and the `<Boundary>` timing. This note covers what was
left in the Phase 2 row, and records each place where the build differs from the research it comes from.

## 1. What's in scope

| Piece | PLAN row text | Built as |
|---|---|---|
| Media | `<Media>` for stills, `@weft-js/plugin-media` (sharp + SVGO, AVIF + fallback, SSIMULACRA2 search, placeholders, layout-solved `sizes`), M001–M013 | `@weft-js/core/media` (the component and the `?media` record type), `@weft-js/plugin-media` (the `media.build` provider and the M-code check), `?media` in `@weft-js/core/vite` (§2) |
| Fonts | the font build step (subsets, matched fallbacks, preloads) | `@weft-js/text` providing `font.build@1`, consumed by `@weft-js/core/vite` as `weft:fonts` (§3) |
| Skeletons | skeleton shapes for `<Boundary pending>` | `skeletonShape()` geometry in warp-core, `<Shape>` in warp over the spec's Skeleton CSS, and X031 measured in dev (§4) |
| Type | fluid `cqi` type tokens | the spec CSS already has them. warp-core gets the typed token layer: `fluid()`, `TYPE_SCALE`, and a test that ties both to the CSS (§5) |
| Scaffold | `create-weft --ui` | `packages/create-weft`: `create-weft <dir> --ui warp\|headless\|none` (§6) |
| Diagnostics | X005–X008, X020–X031 | the codes research 11 §8.6 assigns to Phase 2: X005, X006, X008, X020–X023, X030, X031, X034 (§7). X007 and X024–X029 are not defined anywhere, so they stay unassigned |

Out of scope, as research 15 §8.2 and 11 §8.6 already phase them: GIF → video, video ladders and `timeline()`
(3c, with ffmpeg), `z.media()` and the server route (3), `encoder: 'background'` (3c), the compiler's shape variant
and `pending="shape"` from query schemas (3), and `@weft-js/core/text` measurement (Surfaces).

## 2. Media

### 2.1 Where the pieces live

- **`@weft-js/core/media`** is a subpath of the `weft` package, not a new package. It holds `<Media>` and the `MediaAsset`
  type: a component and a type, no encoder, no IO. PLAN §8 lists `media` as its own package. That split pays off
  once `timeline()` and the swap runtime exist (3c). Until then a separate package would only add an install step.
- **`@weft-js/plugin-media`** provides the build: probe, resize, encode, quality search, placeholders. It also owns the
  M-codes and ships their checker as a plugin `check` hook (§2.5).
- **`@weft-js/core/vite`** owns the `?media` import. It is the consumer of the slot, the same way the CSS pipeline is the
  consumer of `font.build`. It emits the files the provider returns and turns the record into a module.

### 2.2 One slot, not four

Research 15 names four slots: `media.analyze@1`, `media.encode@1` (keyed by codec), `media.quality@1` and
`media.cdn@1`. Phase 2 has one provider for all of them, and there is no second provider to bind separately. So
Phase 2 defines **one** build-side slot:

```ts
/** media.build@1: one source file in, one record and its derived files out. Cached by content hash. */
interface MediaBuildV1 {
  build(input: { file: string; bytes: Uint8Array; base: string }, ctx: { cacheDir: string; dev: boolean }): Promise<{
    asset: MediaAsset                         // what `import x from './x.jpg?media'` evaluates to
    files: { name: string; bytes: Uint8Array }[]   // derived files, served/emitted under `base`
    diagnostics?: { code: string; message: string }[]   // M004 sizes, M012 for unsafe SVG
  }>
}
```

The split into analyze, encode and quality happens when the ffmpeg provider (3c) needs to replace only the encoder.
`media.build` then becomes the orchestrator over those slots, and its interface doesn't change.

**Without a provider,** `?media` still works. Core probes the file header for dimensions (PNG, JPEG, GIF, WebP,
AVIF, SVG; ~60 lines, no dependency) and returns the original file as the only source. That keeps the main promise,
**dimensions everywhere**, so M001 and X030 can't fire on a `?media` import even in an app with no plugins.

### 2.3 The record

```ts
interface MediaAsset {
  kind: 'photo' | 'graphic' | 'vector'      // photo: lossy sources; graphic: PNG/GIF stills; vector: SVG
  src: string                                 // the compatible fallback at the largest width
  width: number; height: number               // intrinsic, after EXIF orientation
  type: string                                // MIME of `src`
  sources: { type: string; srcset: string }[] // efficient formats first (image/avif), then the fallback
  dominant?: string                           // #rrggbb
  placeholder?: string                        // data:image/webp;base64,… (16 px on the long side)
  name: string                                // the source file name, for M007's "alt equals the file name"
}
```

### 2.4 The pipeline (`@weft-js/plugin-media`)

1. **Probe** with sharp (`metadata()`, auto-orient). SVG goes through SVGO (`preset-default`, keeping `viewBox`).
   M012 (script, `foreignObject`, `on*=`, external `href`) fails the build before SVGO runs, because sanitising it
   silently would hide the problem.
2. **Widths:** a ladder up to the intrinsic width: 320, 640, 960, 1280, 1920, 2560. It never upscales, and the
   intrinsic width is always included. This is not research 15's solved-from-layout ladder. That needs
   `weft-layout` (a Phase 6a crate) and warp's layout primitives, and neither exists yet (§2.6).
3. **Quality search** at the largest width, per format. A binary search over the encoder's quality finds the
   lowest one whose SSIMULACRA2 score is at least the target (80 by default), within 5 encodes. Smaller widths
   reuse that quality: downscaling hides artefacts, so the score only goes up.
4. **Scorer:** the libjxl `ssimulacra2` tool, run as a child process (permission `spawn: ['ssimulacra2']`).
   - The plan was a bundled Rust scorer (`crates/weft-media` on the `ssimulacra2` crate). That is a second napi
     crate with its own release matrix.
   - The only npm option today is `bytecut-ssimulacra2`: a 2-week-old wasm build from one maintainer, which fails
     the supply-chain bar for a default dependency.
   - Without the tool, the search falls back to fixed qualities (AVIF 50, WebP 75, JPEG 78). The record says
     `quality: 'fixed'`, so it is never silent.
   - The scorer is an option (`quality.scorer`), so the Rust crate can replace the tool later without an API
     change.
5. **Formats:** AVIF, plus a fallback in the source's own family (JPEG for photos, PNG for graphics). WebP only on
   request. It is never chosen as the fallback, because every engine that lacks AVIF has JPEG and PNG.
6. **Placeholders:** the dominant colour from `stats().dominant`, and a WebP of 16 px on the long side at quality
   40, base64 (~100–180 characters).
7. **Cache:** `.weft/cache/media/<sha256 of bytes + options>.json` plus its files, so dev restarts and rebuilds
   don't re-encode.

### 2.5 M-codes and the plugin `check` hook

`contribute()` stays pure. A plugin can now return `check: { include: string[], run }`, matching research 13's
`CheckHook`. `weft check` calls `run` once with the matching files and a `ctx` that has `jsx(file)`, the shared JSX
scanner (elements, attributes, ancestors, `?media`/`?url` imports), plus `read(rel)` and `exists(rel)`. Diagnostics
come back with the plugin as `owner`, and a code outside the plugin's namespace is P111, as for declared codes.
`@weft-js/plugin-media` claims the namespace `M`.

All of M001–M013 are reported statically in Phase 2. Where research 15 needed runtime data, this is the static
part:

| Code | Static rule (Phase 2) | Autofix |
|---|---|---|
| M001 | `<img>`/`<video>` without `width`+`height` or an `aspect-ratio` style, outside a `<Boundary>` (inside it's X030) | insert `width`/`height` read from the imported file (safe) |
| M002 | `<img src>` from a `?url` import or a string path to a file in the module graph | suggestion: `?media` + `<Media>` |
| M003 | raw `<img>` whose imported file is wider than its `width` attribute × 2 (DPR) × 1.25 | suggestion: `<Media>` |
| M004 | raw `<img>` of a GIF over 256 KB | suggestion: `<Media>` (the message has the size) |
| M005 | `<video autoplay>` without `muted` | add `muted` (safe) |
| M006 | `<video>` without `poster` | — |
| M007 | `<Media>`/`<img>` with no `alt`; `<Media alt="">` without `decorative`; `alt` equal to the file name | — |
| M008 | a route file's first media has `loading="lazy"`, or a `priority` media with `loading="lazy"` | remove `loading` / add `priority` |
| M009 | more than 2 `priority` media in one route file | remove `priority` (from the third) |
| M010 | a `priority` `<Media>` without `sizes` or `width`: `sizes="auto"` only applies to lazy images, so an eager image would get `100vw` | — (the message names the fix: `width="1/2"` or `sizes`) |
| M011 | `<video autoplay loop>` without `controls`, or a raw `<img>` of a GIF | suggestion: `<Media>` |
| M012 | an imported `.svg` with `<script>`, `foreignObject`, `on*=` or an external reference (also fails the build) | — |
| M013 | an `<img>`/`<video>` `src` string naming a file in `public/` | suggestion: import it with `?media` |

The dev-time confirmations from research 15 (M008 by `weft browser` LCP, M010 by width sampling) and M014–M016 come
with the phases that bring their data.

### 2.6 `<Media>` and `sizes`

```tsx
import { Media } from '@weft-js/core/media'
import hero from './hero.jpg?media'

<Media src={hero} alt="Studio gallery at night" priority />      // eager, fetchpriority=high, sizes from `width`
<Media src={hero} alt="" decorative width="1/3" />                 // sizes="(max-width: 599px) 100vw, 33.33vw"
```

- Renders `<picture>` with one `<source>` per efficient format, then an `<img>` with the fallback `srcset`. It
  renders a bare `<img>` when there's only one format, which covers SVG and provider-less builds.
- **Always sets:**
  - `width`/`height`;
  - `style="aspect-ratio:w/h;background:<dominant> url(<placeholder>) center/cover"`, so the image is its own
    skeleton;
  - `decoding="async"`;
  - `loading="lazy"` unless `priority` is set.
- **`sizes`:** an explicit `sizes` wins. Otherwise `width` (`"1/3"`, `"240px"`, `"50vw"`) is turned into a
  `sizes` string with a phone breakpoint (599 px, warp's). Otherwise lazy images get `sizes="auto"` (Chrome 126+)
  with a `100vw` fallback in the same list. Layout-solved sizes are deferred: they need warp's layout primitives
  (`Grid`, `Split`, `Frame`), which tier 1 doesn't have, and `weft-layout`.
- **`priority`** makes the image eager with `fetchpriority="high"`. It writes no `<link rel="preload">`: the
  `<img>` is in the first HTML response anyway, so the preload would only win the time it takes to parse up to it.
  If that turns out to matter, a head-collector preload is a later addition.
- **`focus={[x, y]}`** becomes `object-position`.
- **No warp wrapper yet.** The spec's Image anatomy styles `[data-scope=image] > img`, which doesn't reach the
  `<img>` inside a `<picture>`. Wrapping `Media` would mean changing the spec selector, and warp is ported from the
  spec, not redesigned. So apps use `@weft-js/core/media` directly until the spec grows a `picture` case.

## 3. Fonts: `@weft-js/text` and `font.build@1`

```ts
// weft.config.ts
plugins: [text({ fonts: {
  body:    { family: 'Inter', src: './fonts/Inter.woff2', fallback: 'Arial' },
  display: { family: 'Space Grotesk', src: './fonts/SpaceGrotesk.woff2', fallback: 'Arial' },
  mono:    { family: 'IBM Plex Mono', src: './fonts/Plex.woff2', fallback: 'Courier New', display: 'optional', preload: false },
} })]
```

- **`measure`:** Phase 2 provides `font.build` only. `text.measure` arrives with Surfaces, so the option is
  `measure: 'off'` for now, and asking for `'auto'` says so (P115).
- **Subsetting:** `subset-font` (HarfBuzz compiled to wasm, so there is no native binary). It writes one woff2 per
  face per subset (`latin`, `latin-ext`, with Google Fonts' `unicode-range` tables), keeping variation axes.
  Research 13 §2.12 planned a Rust subsetter (`klippa`/`subsetter`) and marked its variable-font maturity as
  unverified. HarfBuzz is the reference subsetter, so the JS route is also the safer one.
- **Matched fallbacks:** metrics from `@capsizecss/unpack` (fontkit), with the fallback's metrics from
  `@capsizecss/metrics`, combined as in Capsize and next/font:
  - `size-adjust = (avgWidth / upm) / (fallbackAvgWidth / fallbackUpm)`
  - `ascent-override = ascent / upm / size-adjust`, the same for descent (absolute value) and line gap
  - `src: local("<fallback>")`, family `"<Family> Fallback"` (the name warp's font stacks already use).

  The test checks Inter against Arial: `size-adjust` 107.1%, `ascent-override` 90.4% and `descent-override` 22.5%,
  the values in research 11 §8.2.
- **`font-display`:** `swap` by default, or `optional` per face. `block` and `auto` are rejected (X021, as P115 on
  the option).
- **Output:**
  - `css`: the `@font-face` rules, one per subset, plus the fallback faces;
  - `preloads`: the latin subset of each face with `preload` (default true for `body` and `display`);
  - `files`;
  - `metrics` (`.weft/fonts.json`): cap height, x-height, ascent, descent and line gap per family. The per-character
    advance tables in research 11 are the SSR estimator for `<Text reserve>`, a Phase 3 consumer, so they wait
    for it.
- **Consumption:** `import 'weft:fonts'` (CSS) and `import { preloads } from 'weft:fonts/preloads'` in `@weft-js/core/vite`.
  `@weft-js/start` writes the preloads into the document head. With no provider, both modules are empty.
- **Budget gates** (research 11 §8.4):
  - the generated CSS is ≤ 1.5 KB br;
  - preloaded latin bytes are ≤ 100 KB. Over budget is X022, reported from the build's report in
    `.weft/fonts.json`.

### 3.1 Running build-side slots

Phase 2's plugin runtime ran only `contribute()`. A build-side slot now needs its provider loaded in Node:

- `weft plugins sync` (which `weft check`, `weft dev` and `weft build` run) writes `.weft/slots/<id>.build.json`
  for each bound slot that has a `build` side: `{ plugin, version, module, export, options }`. The module path is
  resolved from the project root.
- `@weft-js/core/vite` reads that JSON and calls `import(module)[export](options)`. The slot's TS module stays the client
  surface. The JSON exists because Node can't import the generated `.ts` file.
- **Permissions are declared, not yet enforced** (research 13 §4 puts enforcement with the trust tooling in 3c).
  `weft plugins list` shows them.

## 4. Skeleton shapes for `<Boundary pending>`

Phase 3 brings the real thing: the compiler's shape variant, sized from query schemas and last-seen payloads.
Phase 2's part is research 11 §7.1's fourth source, **declared static estimates**, drawn with warp's existing
skeleton CSS:

```tsx
import { Shape } from '@weft-js/warp'
<Boundary pending={<Shape kind="list" rows={5} />}>…</Boundary>
<Boundary pending={<Shape kind="card" media="16/9" lines={2} />}>…</Boundary>
<Boundary pending={<Shape kind="text" lines={4} />}>…</Boundary>
```

- **warp-core `skeletonShape(spec)`** is pure geometry. It turns a spec into rows of parts (`{ shape: 'text' |
  'circle' | 'block', inline, block }`). Text bars use the role's line height (the body leading, 1.5em), so the
  shape is as tall as the text that replaces it. The last line of a paragraph is 60%, matching warp's
  `Skeleton lines`.
- **warp `<Shape>`** renders those parts as spec Skeleton markup (`data-scope="skeleton"`, `data-shape`) inside a
  `data-scope="skeleton-scope"` region with `aria-busy="true"`, `inert` and an accessible "Loading" label. That is
  the spec's own SkeletonScope (05 §5). No new CSS: the shimmer is the sweep, it is still under reduced motion, and
  the strength follows the dial. The parts' sizes are inline `inline-size`/`block-size`, the same mechanism
  `Skeleton` already uses.
- **X031 in dev:** at the swap, `<Boundary>` measures the fallback's box before removing it and the content's box
  after inserting it, and warns `X031` when they differ by more than 1 px, with the delta. It costs nothing in
  production (`DEV`-gated) or on the server.

## 5. Fluid type tokens in warp-core

The spec CSS (`styles/warp.css`, copied verbatim) already defines display and title as
`clamp(min·rem, b·rem + m·cqi, max·rem)`, with `--warp-ref-fluid-unit` falling back to `1vw` on iOS 15. warp-core's
TS side had no view of them, so a binding, the CLI or a Surface had to re-derive the numbers. Added:

- **`fluid(minPx, maxPx, { from = 375, to = 1280, unit = 'cqi' })`** returns `{ min, b, m, max }` in rem and the
  clamp string, in the spec's form. `fluid(34, 52)` gives the balanced display values: 2.125, 1.659, 1.989, 3.25.
- **`TYPE_SCALE`:** display and title per dial stop (quiet, balanced, vivid), as the spec's `--warp-ref-*`
  numbers.
- **`fluidRatio()`:** the max/min ratio X006 bounds at 2.5.
- **The test** parses `warp.css` and fails if `TYPE_SCALE` disagrees with it, if any stop's ratio is over 2.5, or
  if `fluid()` doesn't reproduce the spec's own numbers. The CSS stays the source; the TS layer is a checked mirror.
  warp is ported, not redesigned, so nothing in the CSS changes.

## 6. `create-weft --ui`

`packages/create-weft` (bin `create-weft`) scaffolds a `@weft-js/start` app:

```
create-weft my-app [--ui warp|headless|none] [--name <name>]
  weft.config.ts      plugins: [warp()] for warp; site defaults
  package.json        scripts are `weft …` aliases only (no P002)
  tsconfig.json       jsxImportSource weft, types @weft-js/core/client (`?media`, `weft:fonts`)
  src/routes/_layout.tsx, index.tsx, about.tsx
  src/app.css         (none/headless only; warp brings its tokens)
```

- **`warp`:** `@weft-js/warp`, wired through `warp()`. The index page is a `Card` with a `Badge` counter and a
  `Button`.
- **`headless`:** `@weft-js/warp-core` only. The layout imports warp-core's `warp.css` (tokens, base, signature) and the
  app's own markup uses the tokens, including the fluid title size.
- **`none`:** weft and start only, with a small stylesheet.
- **Nothing generated is written.** AGENTS.md, `.weft/` and the slot modules come from `@weft-js/core` on the first
  `weft dev` or `weft check`, so a scaffold can't go stale against the CLI. It doesn't install either; it prints
  the next steps.
- **The test** scaffolds each variant into a temp dir, links the workspace packages, and runs `weft check`, which
  must be clean. Then it starts `weft dev` and server-renders `/` for every variant.
- Writing it surfaced a start bug: an app with no `src/entry.client.ts` got a 500, because start's `load` hook
  answered `virtual:weft/entry-client?assets=client` itself instead of leaving it to Nitro's assets plugin. The
  start fixture has an `entry.client.ts`, so its tests never took that path. Fixed in `@weft-js/start`'s `vite.mjs`.

`weft create` is reserved in `builtinNames` and becomes an alias once `create-weft` is published. Phase 3's
`create-weft` (auth, db, the T3 template) builds on the same templates.

## 7. X-codes for Phase 2

All of them run in `weft check`, in a core pass (`packages/cli/src/text-checks.mjs`) over `.tsx`/`.jsx`, `.css`
and `.html` files. X020–X023 use the font build's report when `font.build` is bound.

| Code | Severity | Rule | Fix |
|---|---|---|---|
| X005 | error | `font-size` in `vw`/`vi`/`cqi`/`cqw` with no `rem` term (CSS files, `style` strings and objects in TSX) | suggestion: the `fluid()` clamp for the same sizes at 375 and 1280 px |
| X006 | error | a `clamp()` font size whose max/min is over 2.5 (rem or px ends) | narrow the range (the message has the ratio) |
| X008 | error | viewport meta with `user-scalable=no` or `maximum-scale` < 2 | **autofix:** remove them |
| X020 | warning | a hand-written `@font-face` for a local file with no `"<Family> Fallback"` face in the project | move it into `text({ fonts })` |
| X021 | error | `font-display: block` or `auto` | **autofix:** `swap` |
| X022 | warning | a local `@font-face` with no `unicode-range` (not subset), or a built face or preload set over budget | use `text({ fonts })`, which subsets |
| X023 | warning | a `<link rel="preload" as="font">` whose href no `@font-face` uses | remove it |
| X030 | error | `<img>`/`<video>`/`<iframe>` without `width`+`height` or `aspect-ratio`, inside a `<Boundary>` | `<Media>`, or dimensions |
| X031 | warning (dev, runtime) | a `pending` fallback whose box differs from the content's by more than 1 px at the swap | `<Shape>` with the content's counts, or fix the size |
| X034 | error | a `pending` fallback that sets its own timers (`setTimeout`/`setInterval` in the element's component) | remove them: `<Boundary>` owns the 150 ms / 400 ms timing |

X030's fix text names `<Media>` with a `?media` import. Outside a `<Boundary>`, a raw `<img>` with no box is
plugin-media's M001.

## 8. Sizes

Measured with brotli q11, minified production builds:

| What | Size | How |
|---|---|---|
| `<Media>` page (`@weft-js/core/media`, one photo with AVIF + JPEG sources) | 3.57 KB br total; hello world is 1.21 KB, so `<Media>` adds about 2.4 KB | `packages/weft/scripts/size.mjs`, row `<Media> (@weft-js/core/media)` |
| warp `Shape` | 1.38 KB own JS (712 B marginal on the full kit page), 244 B own CSS (the skeleton CSS it shares with `Skeleton`) | `packages/warp/scripts/size.mjs` |
| X031 measurement in `<Boundary>` | 0 B in production (behind `DEV`) | |
| Font and media build code | 0 B in the client (runs at build time) | |
| Font preloads | `<link>` tags in the HTML only | |

Most of `<Media>`'s cost is the shared JSX-list and attribute machinery, which a real app usually pays already. The
media-specific code is `mediaSizes()` and `mediaStyle()`. All of this is far under the 50 KB ceiling.

## 9. Open after this change

- A bundled SSIMULACRA2 (Rust `crates/weft-media`, or a vetted wasm build) to replace the `ssimulacra2` tool.
- Layout-solved `sizes` (warp layout primitives + `weft-layout`) and M010's dev width sampling.
- Splitting `media.build` into analyze/encode/quality when the ffmpeg provider lands (3c).
- Enforcing plugin permissions for build-side providers (3c trust tooling).
- Per-character advance tables in `fonts.json` (with `<Text reserve>`, Phase 3).
- The Phase 2 exit check (the v3 shop on weft + warp within budget) is not part of this change.
