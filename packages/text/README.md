# @weft-js/text

> **Not released yet.** This package isn't published on its own. `weft docs fonts` covers what an app uses from it.

Fonts and text for weft. `text()` for `weft.config.ts` is the main entry, `@weft-js/text/build` is the Node-only font build, and `@weft-js/text/measure` and `@weft-js/text/engine` are what a browser loads: nothing Node-only reaches them.

## The engine

**A slim build of [Pretext](https://github.com/chenglou/pretext) by Cheng Lou (`@chenglou/pretext` 1.0.0, MIT).**
Pretext does the hard part: it ports Blink's, WebKit's and Gecko's line breaking and their measurement rules to
JavaScript, so a paragraph's height comes from arithmetic over canvas widths instead of DOM reflow. This package
changes none of that logic. It specialises Pretext per engine, cuts its tables down to a base alphabet, moves the
rest into lazy chunks, and puts a small "lite" tier in front for plain Latin and emoji text. Credit for the
engine goes to Pretext. Bugs in the slicing are ours. Research and numbers: [archived research](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/docs/research/12-text-engine-slim.md).

## Size

Brotli 11 after terser, as `npm run build && npm run size` reports it. This build skips `npm run coverage`, which needs
Chrome, so the "rare" pack is empty and its code is still in the exact tier.

| Engine | Base chunk (what a page loads) | Exact tier (lazy) | Script data + CJK/SEA code (lazy) | Other lazy packs |
|---|---|---|---|---|
| Blink | **8.17 KB** | 11.22 KB | 12.37 KB | complex 2.0, spacing 0.8 |
| WebKit | **9.49 KB** | 10.14 KB | 10.31 KB | complex 2.2, spacing 0.8, families 1.9 |
| Gecko | 16.58 KB (exact tier in base; no lite tier yet) | n/a | 7.84 KB | complex 2.1, spacing 0.8 |

Upstream `prepare` + `layout` + `clearCache` was 33.9 KB br for all engines in one file when research 12 measured it. The base figures include
the 0.21 KB detector shell (`dist/index.js`).

## API

<!-- example: skip @weft-js/text/engine ships no type declarations yet, and text, width and lineHeight are yours -->
```ts
import { loadTextEngine } from '@weft-js/text/engine'
const te = await loadTextEngine()             // loads only this browser's engine chunk
const h = te.prepare(text, '16px Inter', { whiteSpace: 'normal' })
const { height, lineCount } = te.layout(h, width, lineHeight)
const ranges = te.lines(h, width)             // [{ width, start, end }], cursors as Pretext gives them
te.clear()                                    // Pretext's clearCache(), plus the lite tier's caches
```

It follows weft's `MeasureProvider` contract (`prepare`, `layout`, `lines`, `lineText`, `clear`, see `src/types.ts`). Extras:
- `needs(text, font, opts)`: the lazy packs a text needs, from a scan of its code points.
- `load(packs)`: preload those packs.
- `setLocale()`.

`lineText(h, line)` needs a handle prepared with `{ segments: true }`. That works on both tiers: a lite handle keeps its
collapsed text and segment starts, so asking for strings doesn't load the exact tier.

A handle has `exact` and `ready`. While a pack it needs is still loading, `layout()` returns an estimate marked
`exact: false`. Once `ready` settles the same handle is exact, so there's no need to prepare it again. Call
`load(needs(...))` before preparing to never see an estimate.

## How it is built

- **`vendor/pretext/`** is a mechanically split copy of the pinned npm tarball. Its version, sha256 and integrity are in
  `package.json` under `pretext`; the independent accuracy reference uses the installed pin.
  `node scripts/pretext-split.mjs` checks the split against its pinned input and patch; pass `--write` to regenerate it.
- **`scripts/specialize.mjs`** writes `gen/<engine>/`:
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

`npm run test:accuracy` runs headless Chrome and WebKit. It compares every paragraph's line count with unmodified
Pretext at 11 widths and with DOM heights at 320 and 480 px. It also compares `lines()` with `walkLineRanges()` on
lite handles. The corpus covers Latin, hard Latin, emoji, Arabic, CJK, Thai and mixed text, 1,000 paragraphs each.
Fonts are Arial, Times New Roman, Georgia, Verdana and Helvetica.

The bar is zero differences from upstream, and the 2026-10-28 run met it. Every DOM mismatch is one upstream has too.

`npm test` (vitest, no browser) checks:
- the restricted break scans against upstream's full ones, on the corpus and a fuzz over the alphabet, with and
  without the rare pack;
- the lite counter and walker;
- the alphabet and the engine detector.

## Staying in sync with upstream

1. Bump `devDependencies["@chenglou/pretext"]` and run `npm pack @chenglou/pretext@<v>` into a clean folder. Check its
   sha256 and update the `pretext` block.
2. Replace `vendor/pretext/src` and `vendor/pretext/LICENSE` with the tarball's. Leave out its tests.
3. Run `npm run gen` and check its output:
   - The specialiser fails loudly if a moved function or a profile field disappeared.
   - The printed fold count must stay explainable.
   - Profile folds only touch `profile.`, `engineProfile.` and `getEngineProfile().`.
4. Run `npm run coverage`, `npm test`, `npm run build` and `npm run test:accuracy`.
   - **Merge only with zero differences from upstream** in both browsers.
   - A new correction in Pretext's measurement needs a matching envelope check in `src/lite.ts`. Otherwise the
     accuracy run shows it as diffs on lite handles (`tier: "l"`).
