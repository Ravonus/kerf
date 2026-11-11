<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/text</h1>

<p align="center">
  <strong>Fonts declared once, subset and fallback-matched at build time, and exact line breaking in the browser.</strong><br>
  A slim, per-engine build of Pretext measures text by arithmetic instead of DOM reflow.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/text"><img src="https://img.shields.io/npm/v/@weft-js/text?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/weft/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/weft/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/weft/quality.yml?branch=main&label=checks" alt="checks"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/weft/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md) before you upgrade.

Fonts and text for Weft. An app declares its fonts once, in `text()` in `weft.config.ts`. The build subsets each face,
writes a metric-matched fallback face so the swap doesn't shift layout, and preloads what's above the fold. The same
plugin provides `text.measure`, the line breaking that canvas text and exact row heights need, loaded only when
something measures.

The package has four entries. `text()` (the main entry) is the plugin, `@weft-js/text/build` is the Node-only font
build, and `@weft-js/text/measure` and `@weft-js/text/engine` are what a browser loads: nothing Node-only reaches them.

## Highlights

- **One place for fonts.** `text({ fonts })` is the only place font files are declared; a hand-written `@font-face`
  without a fallback face is X020.
- **No layout shift on swap.** Each family gets a `"<Family> Fallback"` face with `size-adjust` and ascent, descent and
  line-gap overrides computed from the font's metrics (Capsize's method).
- **Subset per `unicode-range`.** Faces are cut to hashed woff2 files per subset, and cached by content hash.
- **Trimmed in a build.** Custom axes the source never varies are pinned, and `latin` splits into a preloaded core and
  a lazily fetched rest. Neither cut changes how the page looks or which characters it can show.
- **Budgets enforced.** Over 100 KB of preloaded fonts, or over 1.5 KB brotli of generated font CSS, is X022.
- **Measurement that costs nothing until used.** `text.measure` is loaded through `import()` the first time something
  measures; `measure: 'off'` removes it.
- **Small engine.** The base chunk a page loads is 8.20 KB br on Blink and 9.50 KB on WebKit, against 33.9 KB for
  upstream Pretext in one file (see [Size](#size)).
- **Zero differences from upstream.** The accuracy run compares line counts with unmodified Pretext over 7,000
  paragraphs in Chrome and WebKit (see [Accuracy](#accuracy)).

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Fonts](#fonts)
  - [Options](#options)
  - [Face options](#face-options)
  - [What the build does](#what-the-build-does)
  - [Trimming](#trimming)
  - [Using a face](#using-a-face)
- [Measuring text](#measuring-text)
  - [The engine](#the-engine)
  - [Engine API](#engine-api)
  - [Exact and estimated handles](#exact-and-estimated-handles)
- [Size](#size)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [How it is built](#how-it-is-built)
- [Accuracy](#accuracy)
- [Staying in sync with upstream](#staying-in-sync-with-upstream)
- [Related packages](#related-packages)
- [Contributing](#contributing)
- [License](#license)

## Install

```bash
# npm
npm install @weft-js/text

# pnpm
pnpm add @weft-js/text

# bun
bun add @weft-js/text
```

Or let the `weft` CLI install it and add it to `weft.config.ts` in one step:

```bash
npx weft add text
```

`weft add text` installs the package and adds `text()` to `plugins`. The `landing` template already lists it. `weft docs fonts` covers what an
app uses from it.

## Quick start

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import { text } from '@weft-js/text'

export default defineConfig({
  plugins: [
    text({
      fonts: {
        body: {
          family: 'Inter',
          src: 'assets/fonts/inter.woff2',
          fallback: 'Arial',
          axes: { wght: [100, 900] },
        },
        display: {
          family: 'Fraunces',
          src: 'assets/fonts/fraunces.woff2',
          fallback: 'Georgia',
          weight: 700,
        },
      },
    }),
  ],
})
```

Then name the faces in CSS, each with its fallback second:

```css
body { font-family: "Inter", "Inter Fallback", sans-serif; }
h1 { font-family: "Fraunces", "Fraunces Fallback", Georgia, serif; }
```

There is nothing to import. `@weft-js/core/vite` loads the generated CSS in the client entry (Start) or the page (an
HTML app), and puts the preload links in the head.

## Fonts

### Options

Options of `text()`. Anything else is refused with the option's path (P115).

| Option    | Type                       | Default     | What it does                                                                                                  |
| --------- | -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `fonts`   | `Record<string, Face>`     | `{}`        | Role to face. The keys are roles of your choosing; `body` and `display` are preloaded by default.            |
| `subsets` | `Subset[]`                 | `['latin']` | Unicode ranges to cut every face to: `latin`, `latin-ext`, `cyrillic`, `cyrillic-ext`, `greek`, `greek-ext`, `vietnamese`. Must be non-empty. |
| `measure` | `'auto' \| 'off'`          | `'auto'`    | `'auto'` provides `text.measure`, loaded lazily by what uses it; `'off'` leaves the slot unbound.            |
| `engine`  | `'slim' \| 'pretext'`      | `'slim'`    | `'slim'` is `@weft-js/text/engine`; `'pretext'` is pinned upstream Pretext (33.9 KB br).                     |
| `trim`    | `boolean`                  | `true`      | Pin custom axes the source never varies and load uncommon latin characters on demand. Builds only.           |

### Face options

| Option     | Type                                  | Default                             | What it does                                                                                     |
| ---------- | ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `family`   | `string`                              | required                            | The family name CSS uses.                                                                        |
| `src`      | `string`                              | required                            | The font file, relative to the project root: woff2, woff, ttf or otf.                            |
| `fallback` | `string`                              | required                            | The system face the fallback is matched to: Arial, Helvetica, Times New Roman, Georgia, Courier New, Verdana. |
| `display`  | `'swap' \| 'optional' \| 'fallback'`  | `'swap'`                            | `font-display`. `block` and `auto` are refused: they hide text while the font loads (X021).      |
| `weight`   | integer 1–1000                        | `400`                               | The face's weight. A `wght` range in `axes` takes its place in the `@font-face` rule.            |
| `style`    | `'normal' \| 'italic'`                | `'normal'`                          | The face's style.                                                                                |
| `axes`     | `Record<string, [min, max]>`          | `{}`                                | `{ wght: [400, 700] }` sets the weight range. A build cuts each named axis to its range; a custom axis named here is kept whatever the source sets. |
| `preload`  | `boolean`                             | `true` for `body` and `display`     | Preload the face's first latin file. Other roles preload only with `preload: true`.              |

Two roles on the same face (same family, `src`, weight and style) emit it once; it's preloaded if either asks.

### What the build does

The build runs inside `@weft-js/core/vite`, through the `font.build@1` slot. For each face it:

1. Subsets the file per `unicode-range` (HarfBuzz, through `subset-font`) to hashed woff2 files. Results are cached
   by content hash, so an unchanged face isn't cut again.
2. Writes the `@font-face` rules, and a `"<Family> Fallback"` face over `local("<fallback>")` with `size-adjust`,
   `ascent-override`, `descent-override` and `line-gap-override` set so the fallback takes the same space as the font.
   `size-adjust` comes from the ratio of average glyph widths; the vertical overrides are divided by it.
3. Lists the preloads, which go in the page's head before the first byte.
4. Checks the budgets: 100 KB of preloaded font bytes and 1.5 KB brotli of generated font CSS (X022). Dev serves whole
   faces, so the preload budget is only checked in a build.

The plugin also gives generated share cards the `display` and `body` faces, so their title and text are set in the
app's fonts.

`import 'weft:fonts'` still works and changes nothing. `import { preloads } from 'weft:fonts/preloads'` gives the
preload list to a custom server.

### Trimming

Font bytes are what hold back the largest paint on a text hero, so a build trims each face without being asked:

- **Axes.** A custom axis (`SOFT`, `WONK`, `GRAD`…) is pinned to the one value your `font-variation-settings` give it,
  or to the font's default if the source never sets it. An axis set to two values stays. A value Weft can't read from
  the source (`var()`, a template, an expression) keeps every axis. `wght`, `wdth`, `opsz`, `slnt` and `ital` are never
  pinned: CSS drives them. An axis named in `axes` is cut to that range, or to one value when the range is a point:
  `axes: { wght: [500, 700] }` drops the rest of the weight axis.
- **Characters.** `latin` becomes two files. The core is preloaded: ASCII, common punctuation, and every other latin
  character in your source. The rest (`latin-rest`) is fetched through `unicode-range` only by a page that shows one
  of those characters, so text from a database still gets the face, after a fallback-matched swap.

> [!WARNING]
> Only your own source is read. A pinned value applies to every use of the face, so an axis set at runtime or by a
> dependency's CSS needs declaring: `axes: { SOFT: [0, 100] }`. `trim: false` turns all trimming off.

`weft dev` always serves whole faces, so an axis you are editing responds.

### Using a face

The build declares faces; it doesn't apply them. Name one in your CSS with its fallback second, as in the
[Quick start](#quick-start). Use the same family names in `font` strings you pass to measurement, and name a family
rather than `system-ui` or a generic (X002): canvas and CSS can resolve those differently.

## Measuring text

`text()` provides the `text.measure@1` slot, on the client and in workers. It is what canvas `s.text()` in a
`<Surface>`, `measure()`, `lines()` and `fit()` from `@weft-js/core/text`, and a warp list given `text` use to know a
paragraph's height without rendering it. Nothing is loaded until one of them measures. Without the slot, canvas
`s.text()` fails with P101; on `webgl2` the mirror is the visible text and no plugin is needed. See `weft docs surface`.

`engine: 'slim'` (the default) loads `@weft-js/text/engine`. `engine: 'pretext'` loads upstream `@chenglou/pretext`
behind the same calls.

### The engine

**A slim build of [Pretext](https://github.com/chenglou/pretext) by Cheng Lou (`@chenglou/pretext` 1.0.0, MIT).**
Pretext does the hard part: it ports Blink's, WebKit's and Gecko's line breaking and their measurement rules to
JavaScript, so a paragraph's height comes from arithmetic over canvas widths instead of DOM reflow. This package
changes none of that logic. It specialises Pretext per engine, cuts its tables down to a base alphabet, moves the
rest into lazy chunks, and puts a small "lite" tier in front for plain Latin and emoji text. Credit for the
engine goes to Pretext. Bugs in the slicing are ours. Research and numbers: [archived research](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/docs/research/12-text-engine-slim.md).

`loadTextEngine()` picks the engine from the user agent the way Pretext's `getLayoutEngine()` does: `Firefox/` is
Gecko, `AppleWebKit/537.36` is Blink, any other `AppleWebKit/` is WebKit (Safari, and every iOS browser), and anything
else is laid out as Blink. Only that engine's chunk loads.

### Engine API

<!-- example: skip @weft-js/text/engine ships no type declarations yet, and text, width and lineHeight are yours -->

```ts
import { loadTextEngine } from '@weft-js/text/engine'
// Load only this browser's engine chunk.
const te = await loadTextEngine()
const h = te.prepare(text, '16px Inter', { whiteSpace: 'normal' })
const { height, lineCount } = te.layout(h, width, lineHeight)
// [{ width, start, end }], cursors as Pretext gives them.
const ranges = te.lines(h, width)
// Clear Pretext's cache and the lite tier's caches.
te.clear()
```

It follows Weft's `MeasureProvider` contract (`prepare`, `layout`, `lines`, `lineText`, `clear`, see
[`src/types.ts`](https://github.com/Ravonus/weft/blob/main/packages/text/src/types.ts)).

| Call                              | Returns                       | What it does                                                                                     |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `prepare(text, font, opts?)`      | `Handle`                      | Segments and measures a text in a CSS `font` string. See prepare options below.                  |
| `layout(handle, width, lineHeight)` | `{ height, lineCount }`     | Breaks the prepared text at `width`.                                                             |
| `lines(handle, width)`            | `LineRange[]`                 | Each line as `{ width, start, end }`: segment and grapheme cursors, and the width without hanging spaces. |
| `lineText(handle, line)`          | `string`                      | A line's text. Needs a handle prepared with `{ segments: true }`.                               |
| `clear()`                         | `void`                        | Clears Pretext's cache and the lite tier's caches.                                               |
| `needs(text, font, opts?)`        | `Pack[]`                      | The lazy packs a text needs beyond the base chunk, from one scan of its code points.             |
| `load(packs)`                     | `Promise<void>`               | Preloads those packs.                                                                            |
| `loaded()`                        | `readonly Pack[]`             | The packs loaded so far.                                                                         |
| `setLocale(locale?)`              | `void`                        | Passes a locale to Pretext's `setLocale` and the lite tier, now and for packs loaded later.      |
| `engine`                          | `'blink' \| 'webkit' \| 'gecko'` | Which engine chunk this is.                                                                   |

`needs`, `load`, `loaded`, `setLocale` and `engine` are this engine's extras, not part of the provider contract.
Packs are `exact` (the exact tier itself), `complex`, `scripts`, `spacing`, `families` and `rare`.

Prepare options:

| Option          | Type                         | Default    | What it does                                                          |
| --------------- | ---------------------------- | ---------- | --------------------------------------------------------------------- |
| `whiteSpace`    | `'normal' \| 'pre-wrap'`     | `'normal'` | CSS `white-space`.                                                    |
| `wordBreak`     | `'normal' \| 'keep-all'`     | `'normal'` | CSS `word-break`.                                                     |
| `letterSpacing` | `number` (px)                | none       | CSS `letter-spacing`. Loads the `spacing` pack.                       |
| `segments`      | `boolean`                    | `false`    | Keep each segment's text so `lineText()` works. Costs memory.         |

`lineText(h, line)` works on both tiers: a lite handle keeps its collapsed text and segment starts, so asking for
strings doesn't load the exact tier.

### Exact and estimated handles

A handle has `exact` and `ready`. While a pack it needs is still loading, `layout()` returns an estimate marked
`exact: false`. Once `ready` settles the same handle is exact, so there's no need to prepare it again. Call
`load(needs(...))` before preparing to never see an estimate:

<!-- example: skip @weft-js/text/engine ships no type declarations yet, and text, width and lineHeight are yours -->

```ts
import { loadTextEngine } from '@weft-js/text/engine'

const te = await loadTextEngine()
const font = '16px Inter'
await te.load(te.needs(text, font))
const h = te.prepare(text, font)
te.layout(h, width, lineHeight) // exact on the first call
```

## Size

Brotli 11 after terser, measured with `node scripts/specialize.mjs --no-rare` and
`node scripts/build.mjs --minifier terser`. The "rare" pack is empty and its code is still in the exact tier.

| Engine | Base chunk (what a page loads)                  | Exact tier (lazy) | Script data + CJK/SEA code (lazy) | Other lazy packs                       |
| ------ | ----------------------------------------------- | ----------------- | --------------------------------- | -------------------------------------- |
| Blink  | **8.20 KB**                                     | 11.06 KB          | 12.32 KB                          | complex 2.0, spacing 0.8               |
| WebKit | **9.50 KB**                                     | 10.03 KB          | 10.33 KB                          | complex 2.2, spacing 0.8, families 1.9 |
| Gecko  | 16.57 KB (exact tier in base; no lite tier yet) | n/a               | 7.76 KB                           | complex 2.1, spacing 0.8               |

Upstream `prepare` + `layout` + `clearCache` was 33.9 KB br for all engines in one file when research 12 measured it.
The base figures include the 0.21 KB detector shell (`dist/index.js`). `pnpm --filter @weft-js/text size` writes the
current figures to `dist/size.json`.

## API reference

| Export                   | Side        | What it is                                                                                         |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------------------- |
| `@weft-js/text`          | config      | `text(options?)`, the plugin for `weft.config.ts`: provides `font.build@1` and `text.measure@1`. Also `SUBSETS`, every subset the build can cut, and the `TextOptions`, `Face` and `Subset` types. |
| `@weft-js/text/build`    | Node, build | `createFontBuild({ fonts, subsets, trim })`, the `font.build@1` provider, plus its helpers: `RANGES`, `BUDGET`, `rangeText`, `toRange`, `scanAxes`, `readAxes`, `pinned`, `fallbackFace`. |
| `@weft-js/text/measure`  | browser     | `createMeasure({ engine })`, the `text.measure@1` provider: this package's engine, or upstream Pretext behind the same calls. Reached only through the slot's `import()`. |
| `@weft-js/text/engine`   | browser     | `loadTextEngine(name?)` and `detectEngine(ua?)`: the built per-engine chunks behind a 0.21 KB detector. |

<details>
<summary>Slots provided</summary>

| Slot              | Sides            | Provider                                         | When                    |
| ----------------- | ---------------- | ------------------------------------------------ | ----------------------- |
| `font.build@1`    | build            | `createFontBuild` from `plugin/build.mjs`        | Always                  |
| `text.measure@1`  | client, worker   | `createMeasure` from `@weft-js/text/measure`     | Unless `measure: 'off'` |

The plugin asks for read access to `**/*.{woff2,woff,ttf,otf}` and nothing else.

</details>

## Troubleshooting

| Code  | What happened                                                                                           | Fix                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| P115  | An option `text()` doesn't know, a bad value (`display: 'block'`, a weight outside 1–1000, an unknown subset), or a `fallback` with no known metrics. The message names the path. | Fix the option. Use a common system face as `fallback`: Arial, Helvetica, Times New Roman, Georgia, Courier New, Verdana. |
| P101  | Canvas `s.text()` with no `text.measure` provider.                                                       | Add `text()` to `plugins`, without `measure: 'off'`.                                    |
| X020  | A hand-written `@font-face` for a local file with no `"<Family> Fallback"` face: the swap shifts layout. | Declare the font in `text({ fonts })`.                                                  |
| X021  | `font-display: block` or `auto`: text is invisible while the font loads.                                 | `swap`, or `optional` for faces that may skip.                                          |
| X022  | A local `@font-face` without `unicode-range`, or the build over budget: 100 KB of preloads or 1.5 KB of font CSS (brotli). | Preload fewer faces (`preload: false`), use fewer weights, faces or subsets.            |
| X023  | A `<link rel="preload" as="font">` whose file no `@font-face` uses.                                      | Remove the preload.                                                                     |
| X001  | `s.text()` predicted one height and its DOM mirror rendered another.                                     | Drop `font` and `lineHeight` so they come from CSS, or make them match.                 |
| X002  | `system-ui`, `-apple-system` or a generic-only family on a measured `s.text()`.                          | Name a family.                                                                          |
| X003  | `s.text()` prepared before its font loaded, with no fallback face.                                       | Declare the font in `text({ fonts })`, which generates the fallback.                    |

An axis that stops responding in a build but works in dev was pinned by trimming: name it in `axes`, or set
`trim: false`.

## How it is built

- **`vendor/pretext/`** is a mechanically split copy of the pinned npm tarball. Its version, sha256 and integrity are in
  `package.json` under `pretext`; the independent accuracy reference uses the installed pin.
  `node scripts/pretext-split.mjs` checks the split against its pinned input and patch; pass `--write` to regenerate it.
- **`scripts/specialize.mjs`** writes `gen/<engine>/`:
  - It inlines the split walker, preparation, Gecko analysis and boundary helpers from their vendor source.
    This keeps hot values local in the shipped engine. Shape checks reject unsupported scopes and calls.
  - It folds the engine profile to constants, so esbuild drops the other engines' code.
  - It re-encodes the break data for that engine only, restricted to `src/alphabet.json`. The scan's state machines
    are pruned to the states reachable over the alphabet's categories and then minimised.
  - It moves CJK/Thai/kana, letter-spacing, WebKit generic-family and complex-walker code into lazy packs. Stubs
    throw `PackMissing`, which the provider catches: it loads the pack and prepares again.
  - Prepare-time code that never ran in `scripts/coverage.mjs` goes to a "rare" pack.
- **`src/lite.ts`** is the lite tier.
  - It reuses Pretext's own break scan and canvas widths, and Pretext's simple line counter with its additions in
    the same order.
  - It runs only inside an envelope where every Pretext correction is zero:
    - the base alphabet and `white-space: normal`;
    - no NBSP or other glue, soft hyphens, bidi controls or unusual spaces;
    - no letter spacing;
    - the font must pass the same probes Pretext runs: space kerning at segment edges (Blink), emoji correction,
      fullwidth curly quotes (Blink Han kerning) and generic families (WebKit).
  - A layout narrower than the widest word needs emergency breaks, so it goes to the exact tier.
- **`scripts/build.mjs`** bundles each engine with code splitting and reports brotli per chunk.

## Accuracy

`pnpm --filter @weft-js/text test:accuracy` runs headless Chrome and WebKit. It compares every paragraph's line count
with unmodified Pretext at 11 widths and with DOM heights at 320 and 480 px. It also compares `lines()` with
`walkLineRanges()` on lite handles. The corpus covers Latin, hard Latin, emoji, Arabic, CJK, Thai and mixed text,
1,000 paragraphs each. Fonts are Arial, Times New Roman, Georgia, Verdana and Helvetica.

The bar is zero differences from upstream, and the 2026-10-28 run met it. Every DOM mismatch is one upstream has too.

`pnpm --filter @weft-js/text test` (vitest, no browser) checks:

- the restricted break scans against upstream's full ones, on the corpus and a fuzz over the alphabet, with and
  without the rare pack;
- the lite counter and walker;
- the alphabet and the engine detector;
- `text()` options and the font build: subsets, fallback faces, preloads, budgets and axis pinning.

## Staying in sync with upstream

1. Bump `devDependencies["@chenglou/pretext"]` and run `npm pack @chenglou/pretext@<v>` into a clean folder. Check its
   sha256 and update the `pretext` block.
2. Replace `vendor/pretext/src` and `vendor/pretext/LICENSE` with the tarball's. Leave out its tests.
3. Run `pnpm --filter @weft-js/text gen` and check its output:
   - The specialiser fails loudly if a moved function or a profile field disappeared.
   - The printed fold count must stay explainable.
   - Profile folds only touch `profile.`, `engineProfile.` and `getEngineProfile().`.
4. Run the package's `coverage`, `test`, `build` and `test:accuracy` scripts.
   - **Merge only with zero differences from upstream** in both browsers.
   - A new correction in Pretext's measurement needs a matching envelope check in `src/lite.ts`. Otherwise the
     accuracy run shows it as diffs on lite handles (`tier: "l"`).

## Related packages

| Package                                                                                   | What it is                                                                          |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core)                | The compiler and runtime. `@weft-js/core/text` and `<Surface>` use `text.measure`; `@weft-js/core/vite` loads the font CSS. |
| [`@weft-js/cli`](https://www.npmjs.com/package/@weft-js/cli)                  | `weft add text`, `weft docs fonts`, and `weft check` for the X codes.               |
| [`@weft-js/warp`](https://www.npmjs.com/package/@weft-js/warp)                | The component library. A warp list given `text` measures rows through this package. |
| [`@weft-js/plugin-media`](https://www.npmjs.com/package/@weft-js/plugin-media) | The image build: the other half of a fast first paint.                              |
| [`@weft-js/create`](https://www.npmjs.com/package/@weft-js/create)            | `npm create @weft-js`; the `landing` template ships with `text()`.                  |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). The repo is one pnpm workspace; from
its root:

| Command                                              | What it does                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm --filter @weft-js/text gen`                    | Writes `gen/<engine>/` with `scripts/specialize.mjs`.                |
| `pnpm --filter @weft-js/text test`                   | Regenerates, then runs the vitest suites.                            |
| `pnpm --filter @weft-js/text build`                  | Regenerates and bundles `dist/` with terser.                         |
| `pnpm --filter @weft-js/text size`                   | Writes brotli sizes per chunk to `dist/size.json`.                   |
| `pnpm --filter @weft-js/text coverage`               | Finds prepare-time code that never runs, for the "rare" pack.        |
| `pnpm --filter @weft-js/text typecheck`              | Regenerates, then type-checks.                                       |
| `pnpm --filter @weft-js/text test:accuracy`          | The Chrome and WebKit accuracy run against upstream.                 |
| `pnpm --filter @weft-js/text test:conformance`       | Builds, then runs the provider conformance check in Chrome and WebKit. |

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE). The engine is built from
[Pretext](https://github.com/chenglou/pretext) by Cheng Lou, MIT; its license ships as
[`vendor/pretext/LICENSE`](https://github.com/Ravonus/weft/blob/main/packages/text/vendor/pretext/LICENSE).
