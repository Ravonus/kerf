# 11 — Text and type: Pretext, fluid type, canvas text, smart skeletons

Research date: 2026-10-28. Versions come from `npm view` on that date unless a source is cited. Browser support comes
from `@mdn/browser-compat-data` 8.1.7 (published 2026-10-22). Statements marked **(unverified)** could not be confirmed
from a primary source. Numbers marked **(measured)** were run for this doc on an M4 Max (load average ~6) in headless
Chrome 156.0.8078.48 and Playwright's WebKit 27.2, against `@chenglou/pretext` 1.0.0 (repo at `0d102a5`, 2026-10-15).
The scripts were throwaway and are not in the repo.

> Numbering: this is the second file numbered 09. [`09-native-targets.md`](09-native-targets.md) already exists. The
> filename was given in the brief, so it is kept. Rename one of them when the index is next touched.

**The ask (from the user):**
- "a new way to do better performant paragraphs and text". This is **Pretext** by Cheng Lou.
- "kick that idea up into a canvas system too".
- Type that is "responsive as shit, but more optimized than it ever has been, but also work on any device, have
  fallbacks and all of that".
- Added mid-task: "the skeleton system to be smart and always be same size as payloads". That is §7.

---

## TL;DR

1. **Pretext 1.0.0 (MIT, released 2026-10-14) is real and accurate, but its win is layout, not preparation.**
   - **How it works:** `prepare()` segments the text with ports of each browser engine's line-break scan, then
     measures each segment once with canvas `measureText`. `layout()` is pure arithmetic over the cached widths.
   - **Accuracy (measured, 1k paragraphs per script):** it matched DOM heights exactly for Latin, emoji and Arabic in
     Chrome and WebKit. In Chrome, 2 CJK paragraphs out of 1,000 were one line off.
   - **Speed (measured, Chrome):** `prepare` costs 8.7–12.6 ms per 1k paragraphs, about the same as DOM measurement
     for Latin (10 ms) and about half for CJK and emoji (22–23 ms). `layout` costs **0.1–0.3 ms per 1k**, against
     ~3 ms to re-read 1,000 DOM nodes after a resize. The DOM figures are from an empty page, its best case.
2. **It costs 34.5 KB brotli** (measured: `prepare`+`layout` only; 39.9 KB with rich-inline). That is almost six times
   weft's whole runtime budget (PLAN §3.7). It must be a **lazy chunk that only routes which measure text load**,
   never part of `weft` or warp's base. CSS-only type costs 0 KB.
3. **Fonts must be loaded before you prepare, but a metric-matched fallback makes waiting optional** (measured):
   - Handles prepared before Inter loaded gave the wrong height for 681 of 1,000 paragraphs.
   - Handles prepared against the build-generated `"Inter Fallback"` face (`size-adjust: 107.12%` on Arial) were wrong
     for only **14 of 1,000**, and canvas honours `size-adjust`. Plain Arial was wrong for 329.
   - **Rule:** measure against the fallback first, then re-prepare once when the font arrives (`clearCache()`).
4. **The same fallback face makes the font swap shift nothing** (measured):
   - With a plain Arial fallback, a block of 12 paragraphs grew 1356 → 1452 px (CLS 0.0089).
   - With the matched fallback, it was 1452 → 1452 px (CLS 0).
   - **Safari has `size-adjust` (17+) but not `ascent-override`** (it is only in Technology Preview). weft sets an
     explicit unitless `line-height` on every role, so line boxes never depend on ascent and descent, and
     `size-adjust` alone gives zero shift there.
5. **Responsive type is CSS first.**
   - **Fluid sizes:** `clamp(rem, rem + cqi, rem)` on the display and title roles. Body stays in fixed `rem`.
   - **Zoom:** the ratio of max to min must stay ≤ 2.5 so 200% zoom still doubles the text (WCAG 1.4.4).
   - **Wrapping and trimming:** `text-wrap: balance` on headings and `pretty` on prose. `text-box: trim-both cap
     alphabetic` on controls and headings is now in all three engines (Safari 18.2, Chrome 133, Firefox 154).
   - **Not worth building on:** `hanging-punctuation` (Safari only), `initial-letter` (no Firefox) and
     `line-height-step` (never shipped; not in BCD). They are vivid-stop progressive extras at most.
6. **Canvas text is a mirror problem, not a drawing problem.** Pretext + `fillText` is cheap (measured: 1k
   paragraphs, 4,313 lines laid out in 1.1 ms). The work is the **DOM mirror**:
   - **What it is:** one element per paragraph, positioned on the same lines, with transparent text.
   - **What it gives:** selection, find-in-page, translation and screen readers, all for free.
   - **Cost per change:** one text-node write or one transform write. The canvas *reads* the mirror, so a page
     translator that rewrites the mirror's text recolours the canvas too.
   - **Fallbacks:** forced colours and print show the mirror instead of the canvas.
   - **Editing:** only through a real `<textarea>`/`contenteditable` overlay (the Excalidraw approach). `EditContext`
     is Chrome-only.
7. **Flutter Web is the cautionary tale.** Its semantics tree is "not on by default" for performance reasons; users
   must find an invisible "Enable accessibility" button. weft's mirror is always on, and it is also the source of
   truth for the canvas text.
8. **Smart skeletons work without hand-writing them, and the last-seen payload is what gets them exact**
   (measured CLS, 20-row feed at phone size):

   | Skeleton | CLS when rows persist (keyed) | CLS when rows are swapped |
   |---|---|---|
   | naive, 5 fixed bars | 0.848 | 0.474 |
   | shape from the Zod schema | 0.171 | **0** |
   | last-seen heights | **0** | **0** |
   | exact skeleton, but images without dimensions | 0.295 (max 0.968) | 0.147 |

   So weft:
   - **swaps** the skeleton for content (never morphs it in place) unless it has exact per-key heights;
   - **fills the viewport** with the skeleton;
   - makes undimensioned media a diagnostic.
9. **API:** `@weft-js/core/text` provides `measure`, `lines`, `fit`, `fonts`, `<Text>` and `s.text()` for Surfaces.
   `weft/skeleton` is a sibling: `query.shape`, `<Boundary pending="shape">`, and the compiler-emitted shape variant.
   **Diagnostics:** `X001`–`X041`. **Phases:** fonts and tokens in Phase 2 with warp; measure and mirror with Surfaces;
   shape skeletons with Start (Phase 3); virtualised chat and grid in 3c.

---

## 1. Pretext

### 1.1 Status

| | Value | Source |
|---|---|---|
| Package | `@chenglou/pretext` 1.0.0, published 2026-10-14. First release 0.0.0 on 2026-03-27; 11 releases | `npm view` |
| Licence | MIT. `LICENSE` also carries the BSD- and Unicode-licensed notices for the engine tables it ports | repo `LICENSE`, `TODO.md` |
| Exports | `.` (core) and `./rich-inline`. ESM, `sideEffects: false` | `package.json` |
| Size (measured, esbuild minify) | core `prepare`+`layout`: 91.9 KB raw / 39.1 KB gz / **34.5 KB br**. Everything incl. rich-inline: 109.1 / 45.1 / 39.9 KB. Tree-shaking barely helps, because the engine break tables (`generated/engine-break-data.js`, 34 KB raw) are always reached | this doc |
| Maturity | 1.0 API, very active (last commit 2026-10-15). The test harness has 10,551 "facts" recorded in Chrome 155, Firefox 157 and system WebKit. `TODO.md` "Now" is empty, and an API review is under "End of project" | `CHANGELOG.md`, `TODO.md`, commit log |
| Breaking changes at 1.0 | `layoutNextLine(prepared, maxWidth, start?)` swapped its arguments. Rich-inline cursors became opaque | `CHANGELOG.md` 1.0.0 |
| Origin | Sebastian Markbåge's `text-layout`: canvas shaping, pdf.js bidi, streaming line breaking | README Credits |

### 1.2 The real API (README "API Glossary")

| Call | Returns | Use |
|---|---|---|
| `prepare(text, font, { whiteSpace?: 'normal'\|'pre-wrap', wordBreak?: 'normal'\|'keep-all', letterSpacing?: px })` | opaque `PreparedText` | Paid once per (text, font, options). Never on resize |
| `layout(prepared, maxWidth, lineHeight)` | `{ height, lineCount }` | The hot path: pure arithmetic |
| `prepareWithSegments(...)` | `PreparedText & { segments, kinds, widths }` | Needed by the calls that return line text |
| `layoutWithLines(p, maxWidth, lineHeight)` | `{ height, lineCount, lines: { text, width, start, end }[] }` | Painting lines yourself (canvas, SVG) |
| `walkLineRanges(p, maxWidth, onLine)` | line count. Calls back with `{ width, start, end }` and no strings | Shrink-wrap, binary search for a nice width |
| `measureLineStats(p, maxWidth)` | `{ lineCount, maxLineWidth }` | Allocation-free stats |
| `measureNaturalWidth(p)` | widest line with only hard breaks | max-content |
| `layoutNextLine(p, maxWidth, start?)` / `layoutNextLineRange(...)` | one line, or `null` | Per-line widths: flow around shapes |
| `materializeLineRange(p, range)` | `LayoutLine` | Range → text |
| `prepareRichInline(items, opts)` plus `walk…`, `layoutNext…`, `materialize…` and `measureRichInlineStats` | | Mixed fonts, chips and boxes (`{ width }`) in one paragraph. Not a general CSS inline engine |
| `clearCache()` / `setLocale(locale?)` | | After a web font loads. When `<html lang>` changes, or in a worker |

Cursors are `{ segmentIndex, graphemeIndex }`, not string offsets. A plain-text line has no source offsets yet: issue
#198 is open, so carets and hit testing over plain text are not provided.

### 1.3 How it measures

- **`prepare()`** (`src/prepare.ts`, `src/analysis.ts`, `src/line-breaks.ts`, `src/gecko-line-breaks.ts`):
  1. It normalises white space.
  2. It finds break opportunities with **ports of each engine's own break scan**. The scans were rebuilt from Blink,
     WebKit and Gecko sources in #340 (2026-09-24), and the generated tables come from engine builds.
  3. The engine profile comes from the user agent (`getLayoutEngine()` in `src/measurement.ts`). Unknown engines take
     Blink's.
  4. **`Intl.Segmenter` (word granularity) is used only inside Thai, Lao, Khmer and Myanmar runs**, standing in for
     the engines' dictionaries (`line-breaks.ts:243`). Other text prepares without it.
  5. Each segment is measured once per font with `measureText`, on an `OffscreenCanvas`, or a detached `<canvas>`
     where that is missing.
  6. Widths are cached per font. The caches are bounded: past 262,144 segments across all fonts, they are dropped
     whole (#508).
- **Glue and edge rules:**
  - Non-breaking glue: zero-width glue and NBSP.
  - Soft hyphens: they count width only when a line breaks there.
  - Hanging spaces: excluded from `width`.
  - Tabs: `tab-size: 8`, per engine.
  - `keep-all` groups.
  - Emergency breaks between graphemes (`overflow-wrap: break-word`).
  - **Kerning across spaces and between kana**, which Chrome's page applies but its canvas does not report, is
    re-derived in the Blink profile (#408).
- **Three DOM reads exist, all bounded:**
  1. a hidden span that measures one emoji per font, to correct canvas's emoji width;
  2. `<html lang>`;
  3. the detached canvas.
  `prepare()` and `layout()` never force style or layout (RESEARCH.md "Limits").

### 1.4 Accuracy against browser layout

| Case | Pretext | Evidence |
|---|---|---|
| Latin, emoji, Arabic, 1k paragraphs at 320 and 480 px, 16px Arial | **0 mismatches** in Chrome 156 and WebKit 27.2 **(measured)** | this doc |
| CJK, same | Chrome 2/1000 off by one line. WebKit 0 **(measured)** | this doc |
| Real-usage sample (10,345 cases in scope) | failures: Chrome 0.03%, Firefox 0.02%, webkit-host 0.04% | ENGINE_FOLLOWUPS "By real-usage impact" |
| Bidi | Breaks are right. **No bidi levels or visual order.** Paint each paragraph as one element with `dir`. Lines drawn separately with `fillText` are each ordered as their own paragraph, so digits or punctuation at a break can come out reordered | README Notes |
| Thai, Lao, Khmer, Myanmar | Need `Intl.Segmenter`; without it, `prepare` **throws**. Firefox's word model differs slightly | README Caveats, PLATFORM_BUGS |
| Hyphenation | Soft hyphens only (insert them yourself). **`hyphens: auto` is not predicted** | README |
| `letter-spacing` | Numeric px option. Cursive scripts take no spacing, per engine. Safari keeps optional ligatures in canvas where its page drops them: 26 of 41,888 line counts wrong on Roboto at 0.15px, none on Inter or Arial | ENGINE_FOLLOWUPS "Letter spacing" |
| Variable fonts | Only what the canvas `font` string can say: weight, style and stretch. **`font-variation-settings`, `font-optical-sizing` and `font-feature-settings` are not supported**, and neither is `font-variant-numeric` (`tabular-nums`) | README Caveats |
| `system-ui`, `-apple-system` | Unsafe on macOS. Name the family | README, issue #336 |
| `text-wrap: balance/pretty`, `hanging-punctuation`, `text-rendering: optimizeLegibility`, `word-spacing`, non-default `font-kerning` | Not predicted (it predicts default wrapping) | README Caveats |
| Fractional sizes | Firefox's canvas rounds the font size. Prefer whole px | README |
| User minimum font size, iOS text autosizing | Not seen by Pretext. Set `-webkit-text-size-adjust: 100%` and probe the minimum once | README |
| DPR change (zoom) | Emoji widths move on macOS. Call `clearCache()` and re-prepare | README |
| Server / Node / workers | Throws without Canvas 2D. Inject a global `OffscreenCanvas` whose `measureText` returns widths, and you get Chrome's breaks over your widths. In a worker, call `setLocale()`; the emoji correction does not run there | README, TODO |

What this means for weft:
- warp's `[data-numeric]` (`tabular-nums`) and Inter's `opsz` cannot be expressed to Pretext.
- Numeric cells and most labels are single-line and ellipsised, so this does not matter for wrapping. For wrapped
  text it does, so measured roles must not use those features (X004).

### 1.5 Font loading (measured)

| Prepared against | Wrong heights vs DOM in Inter, 1k paragraphs at 358 px |
|---|---|
| `16px Inter` before Inter loaded (handle kept) | **681** |
| `16px Arial` (plain fallback) | 329 |
| `16px "Inter Fallback"` (Arial with `size-adjust: 107.12%`, generated from Capsize metrics) | **14** |
| `16px Inter` after `FontFace.load()` and `clearCache()` | **0** |

The README warns:
- Use `document.fonts.load(font, text)`, because `unicode-range` families load per subset.
- `document.fonts.ready` does not wait for unused faces.
- Safari keeps fallback widths unless the `FontFace` is added before it loads.

weft therefore owns font loading (§8.2) and bumps a per-role **font epoch** state that measurement derives from.

### 1.6 Benchmarks (measured)

Setup:
- 1,000 generated paragraphs, average ~190 characters, 16px Arial, line height 24px.
- Width 320 px, then resized to 480 px. Median of 7 runs (3 at 4× throttle).
- "DOM batch" = create 1,000 divs, append them, read every height. "DOM loop" = one hidden measurer,
  write then read per text.
- "Drag frame" = `layout` of all 1k at one new width, averaged over 60 widths.
- WebKit timers have 1 ms resolution.

| ms per 1k | DOM batch | DOM re-read after resize | DOM loop | `prepare` cold | `prepare` warm | `layout` | `layout` after resize | drag frame |
|---|---|---|---|---|---|---|---|---|
| Chrome, Latin | 10.0 | 3.1 | 10.8 | 8.7 | 7.8 | 0.2 | 0.2 | 0.12 |
| Chrome, emoji | 22.2 | 3.0 | 22.5 | 11.0 | 10.4 | 0.3 | 0.1 | 0.11 |
| Chrome, CJK | 23.1 | 2.8 | 24.2 | 12.6 | 11.6 | 0.3 | 0.1 | 0.13 |
| Chrome, Arabic | 19.3 | 3.6 | 20.7 | 10.3 | 10.1 | 0.3 | 0.1 | 0.12 |
| Chrome 4× CPU throttle, Latin | 46.3 | 12.9 | 52.1 | 43.2 | 38.1 | 1.2 | 0.9 | 0.52 |
| Chrome 4×, CJK | 101.8 | 12.5 | 107.3 | 57.6 | 50.2 | 1.5 | 0.8 | 0.50 |
| WebKit 27.2, Latin | 11 | 5 | 18 | 8 | 7 | 0 | 0 | 0.13 |
| WebKit 27.2, Arabic | 27 | 13 | 37 | 9 | 9 | 0 | 0 | 0.12 |

How to read it:
- **`prepare` is not cheaper than the DOM for Latin text.** "Warm" (segments already cached) saves only ~10%,
  because segmentation dominates. Pretext's own docs say the same: never rank `prepare()` against `layout()`.
- **`layout` is 10–30× cheaper than a DOM re-read, and the DOM number is its best case.** That is 1,000 nodes that
  must *exist* on an otherwise empty page. In a virtualised list, the off-screen rows don't exist, so the DOM can't
  measure them at all.
- **On a 4×-throttled CPU** (a stand-in for low-end Android), preparing 1k paragraphs costs 43–58 ms, three or more
  frames. So preparation must be **incremental**: prepare what is visible plus overscan first, then the rest in idle
  slices or a worker.
- **A resize drag over 1k paragraphs costs ~0.5 ms per frame** on the throttled CPU. That is the use case.

### 1.7 Known gaps (from the repo's own ledgers)

- No bidi levels or visual order. No per-character positions for Arabic or mixed bidi. `getTextClusters()` is waiting
  on Chrome.
- No `hyphens: auto`, no `text-wrap: balance/pretty`, no `system-ui`, no feature or axis settings.
- No source offsets or carets for plain text (#198), so editing is out.
- Mixed font sizes in one paragraph give widths, not line heights.
- Windows and Android are untested ("untested, not untestable").
- Safari 26 gets about a quarter of real `keep-all` paragraphs wrong; the WebKit profile follows Safari 27.
- Memory: an iPhone with 100k chat messages is "never measured". An offline run retained 565–625 MiB.
- There is a single maintainer, and the code is dense, engine-specific and fast-moving. weft must **pin the exact
  version** and keep its own accuracy check (X001) rather than trust upgrades blindly.

---

## 2. Where it pays off in weft

### 2.1 The reactive shape

Pretext's split maps one-to-one onto weft's primitives:
- `prepare` = `derived(text, font)`. It recomputes only when the text or the font epoch changes.
- `layout` = `derived(prepared, width)`.
- Width comes from one shared `ResizeObserver` box per element, written as `state`.

```ts
import { state, derived, watch } from '@weft-js/core'
import { measure, fonts } from '@weft-js/core/text'

const width = state(0)                              // written by s.box / ResizeObserver, batched per frame
const font = fonts.role('body')                     // Derived<{ css: '16px Inter', lineHeight: 24, epoch: n }>
const prepared = derived(() => measure.prepare(props.text, font.value))   // re-runs on text or font epoch only
const box = derived(() => measure.layout(prepared.value, width.value))    // {height, lineCount}, ~0.2 µs
```

- **One layout per frame:** ResizeObserver callbacks write `width`, and weft's microtask batching coalesces them.
  `derived` is lazy, so a row that's off-screen and unread computes nothing.
- **`toTouchAtMost`:** in a virtualised chat, a resize writes only the spacer height and the visible rows'
  `translateY`. A new message writes one row. Gate: `resize ≤ visible rows + 1`, `append ≤ 3`.
- **Incremental prepare:** `measure.prepareMany(texts, { priority: 'visible' })` prepares in 4 ms slices, using
  `scheduler.yield` (Chrome 129, Firefox 142, no Safari) or a `MessageChannel` fallback. Until a row is prepared, its
  height is the estimate (§5).

### 2.2 Uses

| Use (warp surface) | How | Notes |
|---|---|---|
| **Virtualised chat, feed and kanban** (warp 07, 06) | Exact row heights before render: total height, scroll offset and "jump to message" with no measuring pass. Rows render at the known `translateY` | The core use. Pretext's Markdown-chat demo (`pages/demos/markdown-chat.md`) is the reference |
| **Data grid** (warp 06) | Wrapped-cell rows. Single-line cells don't need it | Mostly ellipsis, so the payoff is low |
| **Masonry and balanced columns** | Card heights known up front, so place cards greedily with no reflow | Pure JS layout over `layout()` |
| **Text around shapes** | `layoutNextLineRange` with per-line widths | Editorial and marketing (warp 08), vivid only |
| **Shrink-to-fit bubbles** | `walkLineRanges` gives the widest line; size to `Math.ceil(maxW)` capped at `maxWidth` | Chat bubbles stop at the longest line, not the max width |
| **Fit text to box** | Binary-search the font size on `measureLineStats` for a line count and max width. ~10 layouts, ~µs | Hero titles and stat tiles. CSS has no equivalent |
| **Zero-CLS skeletons** | Measured bars (§7) | |
| **SSR height hints** | The server has no canvas, so use advance tables (§5) | The estimate is off by one line for 2–4% of paragraphs |
| **Agent-streamed text** | Grow-only reservation, quantised to whole lines (§7.3) | Kills jitter |
| **Dev-time overflow checks** | "Does this button label wrap at 320 px in German?" checked headless in `weft test` | Free with the harness |

---

## 3. Responsive type, CSS first

### 3.1 Support and fallbacks (BCD 8.1.7; "iOS" = Safari iOS; WebView = Android WebView)

| Technique | Chrome / WebView | Firefox | Safari / iOS | iOS 15 has it? | Fallback weft emits |
|---|---|---|---|---|---|
| `clamp()` | 79 | 75 | 13.1 / 13.4 | yes | none needed |
| Container query units (`cqi`) + `@container` | 105 | 110 | 16 / 16 | **no** | a preceding `font-size: clamp(rem, rem + vw, rem)` declaration. Without a container, `cqi` falls back to the small viewport, per spec |
| `font-size-adjust` (number) / `from-font` | 127 | 3 / 118 | 16.4 / 17 | no | fallback faces carry `size-adjust` instead |
| `text-wrap: balance` | 114 | 121 | 17.5 | no | ragged headings (harmless) |
| `text-wrap: pretty` | 117 | **no** | 26 | no | default wrap |
| `text-box-trim` / `-edge` / `text-box` | 133 | 154 | 18.2 | no | Capsize-style negative margins from build metrics, behind `@supports not (text-box: trim-both cap alphabetic)` |
| `hanging-punctuation` | **no** | **no** | 26.5 | no | none (vivid prose only) |
| `font-optical-sizing` | 79 | 62 | 13.1 / 13.4 | yes | static `opsz` default |
| `font-variation-settings` | 62 | 62 | 11 | yes | named weights |
| `initial-letter` | 110 | **no** | `-webkit-` (partial on iOS) | partial | a floated, Pretext-measured drop cap, or none |
| `line-height-step` | **not in BCD.** Was behind a flag in Chrome only; never shipped **(unverified: flag removal date)** | — | — | — | use `rlh`/`lh` units (Chrome 111, Firefox 120, Safari 16.4) for rhythm |
| `@font-face size-adjust` | 92 | 92 | **17** | no | iOS 15/16 get an unadjusted fallback and a small width shift |
| `ascent-` / `descent-` / `line-gap-override` | 87 | 89 | **preview only (iOS: no)** | no | an explicit unitless `line-height` on every role, so line boxes don't depend on them |
| `font-display` | 60 | 58 | 11.1 / 11.3 | yes | — |
| `unicode-range` | 1 (Android 18) | 36 | 3.1 | yes | — |
| `local()` in `src` | all | all | all | yes | used only for fallback faces (`local("Arial")`), never for the brand font (installed versions differ) |
| `@font-face font-variation-settings` | 140 | 62 | **no** | no | axis set in the rule, not the face |
| `rem` / zoom respect | all | all | all | yes | — |
| `text-autospace` (CJK–Latin spacing) | 140 | 145 | 18.4 | no | none |

The iOS 15 column matters because PLAN targets "any device". iOS 15 gets:
- viewport-clamped sizes;
- ragged headings;
- untrimmed boxes (with the margin fallback);
- an unadjusted font fallback.

Every one of those degrades in looks, never in function.

### 3.2 Zoom and user font size (WCAG 1.4.4, 1.4.10)

- **Every size has a `rem` term.** `vw`- or `cqi`-only sizes don't grow with browser zoom or the user's default size
  (X005).
- **`max / min ≤ 2.5` for each fluid clamp** guarantees that 200% zoom renders at least 2× the 100%-zoom size, because
  the `rem` term scales and the container term shrinks. This bound follows the fluid-type analysis by Maxwell Barvian
  (Smashing, 2023) **(unverified: re-derived here, not re-read)**. weft computes it at build time (X006). warp's
  display ratio is 52/34 = 1.53.
- `-webkit-text-size-adjust: 100%`. Never `user-scalable=no` or `maximum-scale < 2` (X008).
- At 320 CSS px (WCAG 1.4.10 reflow), prose must still wrap within the column. `overflow-wrap: break-word` is on
  every measured role, as Pretext requires anyway.

### 3.3 Measure (line length)

- Prose roles set `max-inline-size: var(--warp-measure)`, where the measure is in **`ch` of the actual font** (`ch`
  follows the font's "0" advance, so it is per role).
- Containers decide the column. The measure only caps it: `inline-size: min(100%, var(--warp-measure))`.
- When Pretext is loaded, `fit({ measure: [45, 75] })` can instead **pick the width that minimises raggedness** inside
  the band. `walkLineRanges` over ~8 candidate widths costs µs.

### 3.4 Dial mapping

| Token | quiet | balanced | vivid |
|---|---|---|---|
| Fluid range (display max/min) | 1.3 | 1.53 (today's 34→52) | 1.8 (vivid × 1.18 at the top end) |
| Measure | 72ch | 66ch | 60ch (larger, more expressive type) |
| `text-wrap` | headings `balance` | headings `balance`, prose `pretty` | same, plus `stable` on editable text |
| `text-box` trim | controls, badges, buttons | + headings | + display and drop caps |
| Optical size | `font-optical-sizing: auto` (Inter opsz 14–32) | auto | auto. Display pinned to opsz max via `font-variation-settings` |
| Weight axis | static stops | static stops | display may animate `wght` on hover (respects reduced motion) |
| `hanging-punctuation: first allow-end` | off | off | prose and blockquotes (Safari only) |
| `initial-letter` | off | off | editorial pages only (`data-editorial`) |
| Per-glyph motion | none | label tint only (SIGNATURE) | label tint + expressive heroes (§4.5) |

---

## 4. Canvas and WebGL text for Surfaces

### 4.1 Canvas2D + Pretext

- `layoutWithLines` → `fillText(line.text, x, y)` per line. Measured: 1k paragraphs → 4,313 lines in 1.1 ms; drawing
  the ~37 visible lines took ~0.1 ms of CPU.
- Set `ctx.font` from the same role string, and `ctx.letterSpacing` where used (Chrome 99, Firefox 115, Safari 18.4).
  `ctx.fontKerning` and `ctx.textRendering` don't exist in Safari.
- **Bidi:** draw RTL and mixed paragraphs per line with `ctx.direction` set. Mixed-direction lines can reorder
  (§1.4). Surfaces showing user bidi text should use the DOM path.

### 4.2 SDF / MSDF (WebGL)

- **troika-three-text** 0.52.5 (MIT):
  - Parses `.ttf`/`.otf`/`.woff` with Typr. **No `.woff2`.**
  - Generates a signed distance field per glyph on demand (GPU, with a JS fallback), in a worker.
  - Does kerning, ligatures, RTL/bidi and joined scripts.
  - Falls back to Noto via `unicode-font-resolver` from jsDelivr by default, so weft would self-host that.
  - Exposes `getCaretAtPoint` and `getSelectionRects`.
  - **No accessibility at all.**
  - It is tied to three.js. weft's `webgl2` surfaces are raw GL, so reuse the approach and not the package.
- **MSDF** (msdfgen, Chlumský) keeps sharp corners at large scale with three channels. Prebuild atlases at build time
  for fixed hero strings; generate SDFs at runtime for dynamic text.
- **When:** text in 3D, shader effects (dissolve, warp, glow) and thousands of moving labels. Not for reading text:
  SDF is grayscale, has no hinting and looks soft at body sizes.

### 4.3 WebGPU

- `navigator.gpu`: Chrome 144 desktop / Android 121, Safari 26, Firefox 141 (partial).
- The same SDF atlas works in WGSL. GPU vector path renderers (Vello-class) are not production-ready for UI text on
  the web **(unverified)**.
- **v0:** no WebGPU text path. A `webgpu` Surface draws text through the same atlas helper later.

### 4.4 HiDPI, subpixel, LCD

- **Backing store:** `canvas.width = round(cssW × dpr)`, then `ctx.scale(dpr, dpr)`. Snap baselines to device pixels
  (`round(y × dpr) / dpr`).
- **DPR changes** on zoom or a monitor move: listen with
  `matchMedia('(resolution: ' + dpr + 'dppx)')` and re-arm on each change. `s.dpr` in PLAN §5 is already live. Pretext
  needs `clearCache()` for emoji on a DPR change.
- **Subpixel (LCD) antialiasing** is not available for canvas text on transparent canvases **(unverified)**, and
  macOS has had no LCD AA since 10.14. WebGL text is always grayscale.
- **Design rule:** body-size reading text stays in the DOM; canvas text is for display sizes or for UI drawn inside
  canvas.

### 4.5 Per-glyph animation

- **warp's per-character label tint stays DOM.** Labels are short. The pattern is already accessible: an
  `aria-hidden` `label-chars` copy beside a hidden `label-text`, with letters as generated content (01 §2 "Label
  anatomy"). Pretext adds nothing there.
- **Vivid expressive type (heroes):**
  - **≤ ~200 graphemes:** DOM spans, one per grapheme (`Intl.Segmenter` grapheme granularity), with the real text in
    a visually hidden sibling and the spans `aria-hidden`.
  - **Larger, or per-frame physics:** a canvas Surface with `s.text()`. Pretext gives the lines; x positions come
    from prefix `measureText` widths. That is correct for Latin and CJK; Arabic and Indic shaping make per-glyph x
    wrong, so animate per word or per line there.
- **Reduced motion:** stagger 0 and a single fade (00 §motion). Under `data-motion="reduce"` the hero renders as
  static DOM text.

### 4.6 Accessibility: the DOM mirror (mandatory)

Every `s.text()` paragraph gets a mirror node, and **the mirror is the source of truth**.

```
<surface>
  <canvas aria-hidden="true">                      ← pixels only
  <div data-part="text-mirror">                    ← same box as the canvas, above it
    <p style="transform:translate(x,y); width:w; font:…; line-height:…; color:transparent">real text</p>
    …one element per paragraph, keyed
```

- **O(1) per change:**
  - A text change writes one text node. weft's leaf binding does that already.
  - A move writes one `transform`.
  - Line breaks come from the same `font`/`width`/`line-height`, so the browser wraps the mirror onto Pretext's lines
    (README: "the browser wraps it to the same lines").
  - No per-line or per-glyph DOM.
- **Selection and find-in-page:**
  - The text is real, transparent and stacked above the canvas, so native selection highlights land on the drawn
    glyphs. Use `::selection` with a visible background.
  - Off-screen paragraphs in a virtualised surface are kept as `hidden="until-found"` chunks (Chrome 102,
    Firefox 148, Safari 26.2 partial). `beforematch` scrolls the surface to them.
  - Where `until-found` is missing, everything stays mirrored but under `content-visibility: auto` (Safari 18).
- **Translation:** the canvas draws `mirror.textContent`, watched by one `MutationObserver` per surface. A page
  translator rewrites the mirror, the surface re-prepares that paragraph and redraws it translated.
- **Screen readers:** the mirror is ordinary flow content, with headings and lists where the model has them. The
  canvas is `aria-hidden`.
- **Forced colours** (`forced-colors: active`): hide the canvas text layer and make the mirror visible, in system
  colours. Canvas pixels are not adjusted by forced colours, and `forced-color-adjust` doesn't exist in Safari.
- **Print:** `@media print` hides the canvas and shows the mirror.
- **Editing and IME:**
  - No in-canvas editing in v0.
  - Editing swaps a real `<textarea>` or `contenteditable` into the mirror slot at the same box. IME composition,
    spellcheck and autocorrect are native. This is the Excalidraw WYSIWYG pattern.
  - `EditContext` (Chrome 121, no Firefox or Safari) is the future path for in-canvas editors. It is not built on.
- **Watch: HTML-in-canvas.** BCD lists `drawElementImage` / `captureElementImage` / `requestPaint` for Chrome 157 as
  experimental and non-standard-track. If it ships, real DOM is painted into the canvas and the mirror *is* the
  content. Revisit then.

---

## 5. Fallback ladder ("any device")

| Condition | Detection | What weft does |
|---|---|---|
| No canvas / no WebGL | `getContext` returns `null` | The Surface renders its mirror visibly: plain DOM text in the same box. Text surfaces never show blank |
| Fonts not loaded | font epoch state | Measure against the generated `"<Family> Fallback"` face (14/1000 off, measured). Re-prepare once on load. Layout shift is 0 with matched metrics |
| `Intl.Segmenter` missing (Firefox < 125, Safari < 14.1) | feature test | Pretext throws only for SEA scripts. `measure()` catches that, returns the estimate, and marks the box `exact: false` so the DOM height is read after paint |
| Unicode property escapes missing | the import fails | The lazy chunk fails to load. `measure` drops to the estimate path |
| Low-end Android | `navigator.deviceMemory ≤ 2` (Chromium only) or a frame-time probe | Prepare only visible + overscan. Background prepare in a worker (`OffscreenCanvas` + `setLocale`). Smaller overscan |
| Reduced motion | `prefers-reduced-motion` / `data-motion` | No per-glyph motion, static skeletons (warp.base), streamed text revealed per line, not per token |
| Forced colours | `forced-colors: active` | Mirror visible, canvas text hidden, skeleton bars drawn as `CanvasText`-coloured outlines (§7.5) |
| Print | `@media print` | Mirror shown, skeletons hidden, fluid sizes resolved at the print width |
| SSR (no measurement) | server | Estimate from per-character advance tables extracted at build. Measured: Arial 20/1000 and Inter 42/1000 paragraphs off by **exactly one line**, never more. Estimated rows render with `contain-intrinsic-size: auto <estimate>`, and the client corrects them before first paint |
| `system-ui` requested | build | X002: name a family. Pretext is unsafe on it |

---

## 6. Prior art

| Project | How it does text | Lesson |
|---|---|---|
| **Google Docs** | Moved from HTML to canvas rendering (announced 2021-05-11). Screen readers, braille and magnifiers were declared "not impacted"; a separate accessible DOM is maintained **(mechanism unverified)** | Canvas text at scale works only with a parallel accessible model, and extensions that read the DOM break |
| **Figma** | Its own C++/Wasm renderer on WebGL, moving to WebGPU, with its own shaping **(unverified)** | A design tool can own text fully because it is not a reading surface. weft is |
| **Flutter Web (CanvasKit)** | Draws everything on one canvas. Semantics are a DOM overlay that is **"not on by default"** "for performance reasons"; the user must press a hidden "Enable accessibility" button, or the app calls `ensureSemantics()` | **The lesson.** Accessibility that is opt-in and off the main path doesn't happen. weft's mirror is always on, and it is the text's source of truth, so it can't drift |
| **tldraw** 5.6 | Text shapes are HTML. `TextManager` measures with a hidden DOM div (`measureHtml`, `measureHtmlBatch`, `getBoundingClientRect`) | Measuring through the DOM in batches is what Pretext replaces |
| **Excalidraw** 0.18 | Draws with canvas `fillText` and measures with `measureText`. Editing swaps in a positioned `<textarea>` (`excalidraw-wysiwyg`) | The editing overlay pattern weft copies |
| **troika-three-text** | §4.2 | SDF in a worker. Selection rectangles but no accessibility |
| **Capsize** (`@capsizecss/core` 4.1.3, metrics 4.4.0) | Font metrics (cap height, x-height, ascent, descent, `xWidthAvg`) give exact trims and fallback overrides | weft's build reads the same metrics. The fallback numbers in §1.5 come from it. `text-box` replaces its margin trick where supported |
| **fontaine** 1.0.3 | Generates metric-matched fallback `@font-face` rules automatically | Same idea as weft's build step. Can be used directly if the Rust port slips |
| **Utopia** (utopia.fyi) | Fluid type and space scales from two viewport/ratio pairs, emitted as `clamp()` | weft generates the same scales on `cqi` with `rem` floors, and checks the 2.5 rule |

---

## 7. Smart skeletons

**Goal:** a skeleton always has the size the content will have, so CLS = 0 and nothing jumps when data lands.

### 7.1 Where the size comes from (in order)

1. **Shape mode.** The *same component* renders with placeholder data derived from the query's Zod `output` schema.
   - Strings get a length from:
     - `.length(n)`, or the midpoint of `.min`/`.max`;
     - `.meta({ example })`;
     - field-name heuristics (`title` ≈ 40, `email` ≈ 22, `body` ≈ 200; overridable);
     - else a static default (X036).
   - Pretext measures the placeholder at the real role font and width, so text bars have the true line count for that
     length.
   - Arrays take their count from the query input's `limit` or the schema's `.max()`.
   - Optional and nullable fields use their `meta` probability or are absent.
2. **Last-seen payload.** The client cache stores a *shape record* next to the query's tags, keyed by `fnId + args`:
   - the item count;
   - per-key measured heights (or string lengths and line counts per field);
   - per-image aspect ratios.

   It is tiny: about 8 bytes per row. It persists in memory and, if the app opts in, in `sessionStorage`. This makes
   repeat visits and back navigation exact.
3. **Server hints.** SSR knows the count, and often the strings themselves. SSR renders the real content, so this
   matters for client-side navigation:
   - The router's preload response carries `x-weft-shape: count=20` for routes whose data isn't streamed yet.
   - `.weft/contract.json` lists the per-function default `limit`.
4. **Static estimates.** The last resort: a declared `pending={{ rows: 5, rowHeight: 'list' }}`.

### 7.2 Compiler help

- **The compiler emits a shape variant of each component from its JSX:**
  - **Text nodes** bound to a field become line bars: width from the measured lines, last line at its real width, and
    height = lines × line-height minus the trims.
  - **Images** use their intrinsic `width`/`height` or `aspect-ratio`. Missing dimensions are X030.
  - **Lists** repeat their row's shape `count` times.
  - **Conditionals** take the branch that holds when the data is "typical" (non-empty).
  - **Interactive elements** render inert (`inert` on the skeleton root).
- **Nobody hand-writes skeletons.**
  - warp's `SkeletonScope` (05 §5) already turns `[data-skeleton]` descendants of an `aria-busy` region into shimmer
    blocks of their own size.
  - The shape variant is that same mechanism, fed with placeholder data instead of hand-marked elements.

| Prior art | How | Viable for weft? |
|---|---|---|
| React Suspense fallbacks | Hand-written `fallback` JSX. React throttles fallback reveals **(unverified: `FALLBACK_THROTTLE_MS` 300 ms in React 19)** | The `<Boundary pending>` slot is the same. Hand-written fallbacks drift; X031 catches drift in dev |
| Facebook-style skeletons, `react-loading-skeleton` 3.5.0 (last release 2024-09), `react-content-loader` 7.1.2 | Hand-sized bars or SVG | Not viable as the default: sizes are guesses |
| **boneyard-js** 1.10.0 (MIT, 2026-08) | "Snapshots the real DOM layout": a Playwright CLI captures bone rectangles at fixed breakpoints (375/768/1280) into `.bones.json`, with fixtures for data | Closest prior art. It proves automatic skeletons are wanted. But its bones are frozen per breakpoint and per fixture, so they are wrong at other container widths and for other payload lengths. weft computes at runtime from the shape, at the real width, with no build crawl |
| `skeletonizer`, `auto-skeleton`, `react-skeletonify` | Runtime DOM walks over mock data | Same idea as shape mode, without measurement or schema |

### 7.3 Variable-length content

- **Chat and feeds:** rows get exact heights from Pretext as soon as their text is known. In a virtualised list,
  that is before any of them render. Skeleton rows appear only for the unknown tail, and use last-seen heights.
- **Unknown counts:** use the last-seen count, capped at `min(limit, rows that fill the viewport + 1)`. With no
  history, the skeleton fills the viewport, so everything after the list starts below the fold.
- **Images without dimensions:** X030. In the measured page they caused CLS 0.295 even under an otherwise exact
  skeleton. Server image helpers (`weft/start` image) record `width`/`height` at upload.
- **Streamed agent text:**
  - Tokens are batched to one write per frame.
  - The text box's `min-block-size` only grows, in whole-line steps. It is recomputed with `layout()` at the current
    width per frame (~µs).
  - Blocks that are complete are immutable and keyed. Only the **tail block** is live, and it renders as plain text
    until its Markdown construct closes. A `#` or a code fence never reformats an earlier line upward.
  - Stick-to-bottom uses the exact total height, not `overflow-anchor`, which iOS has only from 27.

### 7.4 Fit with weft

- **`query` exposes `.shape`** next to `.value`. It is a `Derived<Shape>` built from the last-seen record, else the
  schema, and is available synchronously.
- **One boundary, no new primitive.** PLAN §3.6's `<Boundary pending>` takes
  `pending="shape"`:

  ```tsx
  const feed = listPosts.live({ limit: 20 })              // Resource<Post[]> & { shape: Derived<Shape> }

  <Boundary pending="shape">                               {/* shape variant of the children, sized from feed.shape */}
    <Feed posts={feed.value} />
  </Boundary>
  ```

  `<Show when fallback>` is not added. PLAN rule 3 allows one way, and that way is `&&`/ternary plus `Boundary`.
- **Refetches never flash.** `.live` pokes and `refresh()` keep the old value in place (`pending` is true and the
  value is stale). Skeletons appear only when there is **no value for those args**.
- **The no-flash rule:**
  1. The shape is reserved **invisibly from the first paint** (`visibility: hidden` bars), so revealing it later moves
     nothing.
  2. The shimmer appears after **150 ms**, matching warp's RouteProgress threshold.
  3. Once shown, it stays at least **400 ms** **(unverified heuristic)**.
  4. Data that arrives within 150 ms swaps straight in.
- **Swap, don't morph.**
  - Rows existing in both frames are what CLS counts. Reusing skeleton slots for content turned a 0 into 0.171
    (measured).
  - So the skeleton and the content are different subtrees, except when the skeleton came from last-seen per-key
    heights. Then morphing is exact and keeps focus and scroll.

### 7.5 warp visuals

- **Shimmer = the sweep**, as warp 05 already specifies (strength 35/68/100% by stop).
- **Under reduced motion it is static.** `warp.base` already stops `[data-skeleton]`, `[data-part="skeleton"]` and
  `[data-loop]` loops (01 §2 Motion, line 135ff.). The shape variant marks its bars `data-skeleton`, so it inherits
  that.
- **Forced colours:** bars draw as 1px `CanvasText` outlines on `Canvas`, so they stay visible. Shimmer is off.
- **Screen readers:**
  - `aria-busy="true"` on the region.
  - The bars are `aria-hidden`.
  - One polite live message, "Loading <region name>", appears once after the 150 ms delay, and "Loaded" is not
    announced when the content arrives.
  - The individual bars are never announced.

### 7.6 Measurement (measured)

Setup:
- Phone viewport 390×844 @3×.
- A 20-item feed: title 12–70 chars, body 40–360 chars, 30% of items with a 16:9 image.
- The skeleton is the first paint. Data lands at +400 ms. 5 seeds.
- `PerformanceObserver('layout-shift')`, counting every entry. Playwright-driven pages report `hadRecentInput: true`
  with no input, so that filter was dropped.
- "Moved" = the largest jump of a row that was on screen.

| Skeleton source | CLS, content swapped in | CLS, slots reused (keyed) | max move (reused) | predicted vs real row height |
|---|---|---|---|---|
| naive (5 × 72 px bars) | 0.474 | 0.848 | 850 px | — |
| shape (schema mean lengths, Pretext-measured, count = `limit`) | **0** | 0.171 (max 0.211) | 222 px | — |
| last-seen (same payload) | **0** | **0** | 1 px | ≤ 0.38 px |
| last-seen, payload changed (1 of 20 rows replaced, 1 body edited) | **0** | 0.0056 (max 0.019) | 164 px | — |
| exact skeleton, images without dimensions | 0.147 (max 0.48) | 0.295 (max 0.97) | 354 px | — |

---

## 8. Recommendation for weft

### 8.1 API

```ts
// @weft-js/core/text — Pretext lives behind a lazy import; nothing here is in the base runtime
import { measure, lines, fit, fonts, Text } from '@weft-js/core/text'

// One role → one font string, line height and trims, from warp tokens (resolved to px, whole sizes)
const body = fonts.role('body')            // Derived<FontRole>; epoch bumps when the real face loads

// Height of a paragraph at a live width, no DOM
const h = measure(() => props.text, body, width)          // Derived<{ height, lineCount, exact: boolean }>

// Lines for drawing (canvas / SVG)
const ls = lines(() => props.text, body, width)           // Derived<LayoutLine[]>

// Fit: largest size in [min,max] so the text fits `maxLines` at the width; or the best measure
const size = fit(() => props.title, fonts.role('display'), width, { maxLines: 2, min: 28, max: 64 })
const col  = fit.measure(() => props.body, body, { band: [45, 75] })   // ch-band → px width, least ragged

// <Text> knows its height before layout: reserves it (SSR estimate → client exact) and renders a normal element
<Text role="prose" as="p" reserve>{post.body}</Text>        // min-block-size from measure(); data-exact when corrected
<Text role="body" stream={reply}>{reply.value}</Text>       // grow-only, whole-line steps, tail block plain
```

```ts
// Surfaces: canvas text with an automatic mirror
export const Notes = defineSurface({
  name: 'notes', kind: 'canvas2d',
  props: z.object({ items: z.array(z.object({ id: z.string(), text: z.string() })) }),
  setup(s, props) {
    const t = s.text({ role: 'body' })                     // creates the mirror layer and its MutationObserver
    s.frame(() => {
      let y = 0
      for (const it of props.items) {                       // t.para: keyed; one text node / one transform per change
        const p = t.para(it.id, it.text, { x: 16, y, width: s.size.value.w - 32 })
        p.draw(s.ctx)                                       // fillText per line, from the mirror's current text
        y += p.height + 12
      }
    })
  },
})
```

```ts
// weft/skeleton — mostly invisible: query.shape + Boundary pending="shape" + the compiler's shape variant
query({ input, output: PostList, run, shape: { title: { example: 'Release notes for 0.4' } } })  // optional hints
```

- **`measure()` with no font loaded yet** uses the fallback face and returns `exact: false` until the font epoch
  bumps.
- **`<Text reserve>` on the server** uses the advance-table estimate. It writes `contain-intrinsic-size` and
  `min-block-size`; the client corrects them before first paint.

### 8.2 Fonts at build time (Rust compiler or Vite plugin)

`weft.config.ts` `theme.fonts` (role → family + file) drives one build step:

1. **Subset by `unicode-range`:** latin, latin-ext and others on demand. Use the variable file when an axis is used
   (Inter `opsz` adds 25 KB: 48 → 73 KB latin, measured from `@fontsource-variable/inter` 5.3.0).
2. **Read metrics from the font file**, the way Capsize does (ttf-parser/skrifa in Rust). Generate a
   `"<Family> Fallback"` face per role: `src: local(<best system match>)` plus `size-adjust`, `ascent-override`,
   `descent-override` and `line-gap-override`. Computed values:

   | Face | Fallback | `size-adjust` | `ascent-override` | `descent-override` | `line-gap-override` |
   |---|---|---|---|---|---|
   | Inter | Arial | 107.12% | 90.44% | 22.52% | 0% |
   | Space Grotesk | Arial | 109.69% | 89.71% | 26.62% | 0% |
   | Instrument Serif | Times New Roman | 83.94% | 117.94% | 36.93% | 0% |
   | IBM Plex Mono | Courier New | 99.98% | 102.52% | 27.50% | 0% |

3. **Emit `.weft/fonts.json`:**
   - cap height and x-height (used for `text-box` fallback trims and for Pretext heights under trim);
   - per-character advance tables (~2 KB per face for latin), which are the SSR estimator.
4. **Preload only the faces above the fold for the current dial stop.**
   - balanced: Inter + Space Grotesk, 70 KB latin.
   - vivid: + Instrument Serif, 21 KB, and its italic, 22 KB.
5. **`font-display`:**
   - `swap` for body and display: the matched fallback makes the swap shift nothing.
   - `optional` for mono.
   - Never `block` (X021).

### 8.3 warp token changes (to propose to the warp owner; this doc does not edit `docs/design/warp/`)

- **Fluid display and title on container units, with `rem` floors.** From 34 px at 375 to 52 px at 1280:
  - `display: clamp(2.125rem, 1.659rem + 1.989cqi, 3.25rem)`
  - vivid: `clamp(2.507rem, 1.958rem + 2.347cqi, 3.835rem)`
  - `title: clamp(1.5rem, 1.345rem + 0.663cqi, 1.875rem)`
  - Each is preceded by the same clamp with `vw`, for iOS 15. Ratios 1.53 and 1.25 are under 2.5.
- **Body and prose stay fixed `rem` per form factor** (today's 16/15/14), plus the coarse-pointer 16 px floor. Reading
  text should not scale with the container. Today's form-factor table remains for body only.
- **Trimmed boxes:** `text-box: trim-both cap alphabetic` on buttons, badges, chips, eyebrows and headings, with the
  metrics fallback behind `@supports`. Heights in `@weft-js/core/text` subtract the trims.
- **`font-optical-sizing: auto`** with Inter variable. Vivid pins display `opsz` to its max.
- **`--warp-measure` per stop** (72/66/60ch), and `text-wrap` per role as in §3.4.
- **Px-resolved role strings** (`--warp-text-body-canvas: 400 16px Inter`) exported for `@weft-js/core/text` and Surfaces,
  so the measured font can't drift from CSS (X001).
- **Measured roles avoid what Pretext can't see.** `[data-numeric]` (`tabular-nums`) stays on single-line cells.

### 8.4 Budgets (gates)

| Metric | Budget | Measured basis |
|---|---|---|
| Base runtime added by `@weft-js/core/text` when unused | **0 KB** | lazy chunk |
| `@weft-js/core/text` wrapper | ≤ 2 KB br | — |
| Pretext chunk | ≤ 36 KB br, pinned version | 34.5 KB |
| Generated font CSS (faces + fallbacks) | ≤ 1.5 KB br, inlined | — |
| Fonts above the fold, latin, balanced | ≤ 100 KB | 70 KB (Inter wght + Space Grotesk) |
| `prepare`, 1k paragraphs, quiet M-series, Chrome | ≤ 15 ms | 8.7–12.6 ms |
| `layout`, 1k paragraphs | ≤ 0.5 ms | 0.1–0.3 ms |
| Resize drag, 1k paragraphs, 4× throttle | ≤ 1 ms per frame | 0.5 ms |
| Main-thread `prepare` slice | ≤ 4 ms | 4× throttle: 43–58 ms per 1k, so chunked |
| Accuracy | 0 height mismatches on the weft text corpus (Latin, emoji, Arabic) per pinned browser; ≤ 0.5% for CJK | 0 / 0 / 0; CJK 0.2% |
| CLS, font swap with matched fallback | **0** | 0 |
| CLS, skeleton from last-seen or shape (swap) | **0** | 0 |
| CLS, images in query boundaries | 0, enforced by X030 | 0.147–0.295 without |
| `toTouchAtMost`: chat append / resize | ≤ 3 / ≤ visible rows + 1 | — |

### 8.5 Diagnostics (`X0xx`, new prefix for text, type and skeletons)

Fonts and measurement:
- **X001** measured height ≠ rendered height (dev sampling on mount) → the role string, size, line height or width
  passed to `measure` drifted from CSS. The fix names the differing property.
- **X002** `system-ui`, `-apple-system` or a generic-only family on a measured role → name a family.
- **X003** `measure.prepare` called while the role's font isn't loaded and no fallback face exists → use
  `fonts.role()`.
- **X004** a measured role uses a style Pretext can't predict: `text-wrap: balance|pretty`, `hyphens: auto`,
  `word-spacing`, `font-feature-settings`, `font-variant-numeric`, or `opsz` variation → drop it, or mark the node
  `exact: false`.

Responsive type and zoom:
- **X005** `font-size` in `vw`/`cqi` with no `rem` term → `clamp(rem, rem + cqi, rem)` (autofix).
- **X006** a fluid clamp whose max/min > 2.5 → narrow the range.
- **X008** viewport meta with `user-scalable=no` or `maximum-scale < 2` → remove (autofix).

Canvas text:
- **X010** `ctx.fillText` / `strokeText` in a Surface outside `s.text()` (no mirror) → use `s.text()`, or
  `s.decorative()` for text that is truly decorative.
- **X011** a mirror hidden from assistive tech (`aria-hidden`, `display: none`) → leave it to weft.
- **X012** a canvas text surface that opts out of the forced-colours or print fallback.

Font build:
- **X020** a hand-written `@font-face` without a generated fallback face.
- **X021** `font-display: block | auto` on a text role.
- **X022** a font file over budget, or not subset (`unicode-range` missing).
- **X023** a preloaded face not used above the fold, or the dial's display face not preloaded.

Skeletons:
- **X030** `<img>`, `<video>` or `<iframe>` without `width`/`height` or `aspect-ratio` inside a query boundary, or
  anywhere above the fold.
- **X031** a hand-written `pending` fallback whose box differs from the resolved content by > 1 px (dev measures both
  at the swap) → use `pending="shape"`, or fix the size. The message includes the delta.
- **X032** a list over a query result with no count hint: no `limit` input, no `.max()`, no last-seen → add `limit`.
- **X033** a `.live` or `refresh` path that renders `pending` UI while a value exists (skeleton flash on refetch).
- **X034** a custom `pending` with its own timers (breaks the 150 ms / 400 ms rule) → remove the timers.
- **X035** streamed text written into a scroll container without `<Text stream>` (upward reflow, jitter).
- **X036** an output-schema string shown in a shape variant with no length hint → add `.max()`, `.length()` or
  `.meta({ example })`.

Per-glyph motion:
- **X040** per-grapheme DOM spans over > 200 graphemes → use word-level motion or a Surface.
- **X041** per-character spans without `aria-hidden` and an accessible name on the parent (warp's label anatomy is
  the fix).

### 8.6 Phases (mapped to PLAN §9)

| Phase | Adds |
|---|---|
| **1. Core** | Nothing at runtime. Reserve `X0xx` in the catalog |
| **2. UI (warp tier 1)** | The font build step (subsetting, fallback faces, `fonts.json`, preloads), fluid display and title tokens on `cqi`, `text-box` trims with the fallback, `--warp-measure`, `text-wrap`, `<Boundary pending>` timing (150 ms / 400 ms), `SkeletonScope` + reduced-motion and forced-colours bars. X005, X006, X008, X020–X023, X030, X031, X034 |
| **2. Surfaces** | `@weft-js/core/text` lazy chunk (`measure`, `lines`, `fit`, `fonts.role`), `s.text()` with the mirror, forced-colours and print fallbacks, Canvas2D only. X001–X004, X010–X012, X040, X041 |
| **3. Start** | `query` `output` → `.shape`, last-seen shape records in the client cache, the compiler's shape variant, `pending="shape"`, SSR advance-table estimates, `<Text reserve>`. X032, X033, X036 |
| **3c. warp tier 2** | Virtualised chat, feed, kanban and data grid on exact heights, `<Text stream>`, worker preparation on low-end devices. X035 |
| **Later** | SDF/MSDF text for `webgl2` Surfaces, WebGPU atlas, text-around-shape helpers, `EditContext` editors, HTML-in-canvas once it ships |

### 8.7 Risks

- **Pretext is young, dense and single-maintainer.** It has had 11 releases in 7 months, and a 1.0 breaking change two
  weeks ago. Mitigation:
  - pin the version;
  - run weft's own accuracy corpus (X001 data) per pinned Chrome, Firefox and WebKit;
  - keep `measure()` an interface, so the estimate path can stand alone.
- **Size.** 34.5 KB brotli is a large lazy chunk for a "≤ 6 KB" framework. A chat route pays it; a marketing page
  must not.
- **Firefox and Android are less tested** (Pretext's harness has no Android). weft adds Firefox and an Android
  emulator lane to its corpus run.
- **Canvas honouring `size-adjust`** was measured in Chrome only. Check it in WebKit and Firefox before relying on
  14/1000.
- **Mirror alignment.** Mirror lines match canvas lines only if both get the same font, width and line height, and
  Pretext's prediction holds. X001 sampling catches drift in dev; production can't.
- **Shape-mode heuristics are guesses.** First-ever loads are exact only in CLS terms (the swap); the content inside
  the viewport still differs from the bars. Last-seen fixes repeat visits only.
- **Safari's `ascent-override` gap.** If an app sets `line-height: normal`, the fallback swap shifts on iOS. weft
  roles never do, and X004 could flag `normal` on measured roles.

### 8.8 Is it worth it?

| Use | Verdict |
|---|---|
| Virtualised chat, feeds and kanban with exact heights | **Yes.** It is the reason to take Pretext |
| Resize-heavy layouts (split panes, masonry) | **Yes.** `layout` is 10–30× cheaper than a DOM re-read |
| Shape and last-seen skeletons | **Yes.** CLS 0 in the measured cases, with no hand-written skeletons |
| Streaming agent text | **Yes.** Grow-only reservation is cheap, and the jitter is user-visible |
| Fit text to box, shrink-wrap bubbles | **Yes, small.** No CSS equivalent |
| SSR height hints | **Yes, as an estimate.** Off by one line for 2–4% of paragraphs, corrected on the client |
| Canvas2D text with a mirror in Surfaces | **Yes.** Mandatory whenever a Surface draws text |
| Data grid | **Marginal.** Most cells are single-line and ellipsised |
| Text around shapes | **Only for editorial, vivid pages** |
| Per-glyph DOM animation | **Short strings only**, as warp does today |
| SDF/MSDF WebGL text | **Later.** Only for 3D or shader text, never for reading |
| WebGPU text | **No, for now** |
| `hanging-punctuation`, `initial-letter` | **Progressive extras only** |
| `line-height-step` | **No.** It never shipped |

### 8.9 Not in v0

- No in-canvas text editing.
- No bidi visual reordering of our own: bidi text stays DOM.
- No `hyphens: auto` prediction.
- No WebGPU text.
- No build-time DOM crawling for skeletons (boneyard-style).
- No `<Show>` primitive.
- No font-loading API besides `fonts.role()`.

---

## Sources

- Pretext: https://github.com/chenglou/pretext (README, CHANGELOG, RESEARCH.md, ENGINE_FOLLOWUPS.md, PLATFORM_BUGS.md, TODO.md, `src/measurement.ts`, `src/line-breaks.ts`, `src/prepare.ts`, at `0d102a5`) · npm `@chenglou/pretext` 1.0.0 · demos https://chenglou.me/pretext/
- Browser support: `@mdn/browser-compat-data` 8.1.7 (queried 2026-10-28) · https://developer.mozilla.org/en-US/docs/Web/CSS/text-box-trim · https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/size-adjust · https://developer.mozilla.org/en-US/docs/Web/CSS/text-wrap · https://developer.mozilla.org/en-US/docs/Web/API/Intl/Segmenter
- CSS specs: https://drafts.csswg.org/css-inline-3/#text-box-trim · https://drafts.csswg.org/css-fonts-5/#size-adjust-desc · https://drafts.csswg.org/css-contain-3/#container-lengths · https://drafts.csswg.org/css-rhythm-1/ (line-height-step)
- WCAG: https://www.w3.org/WAI/WCAG22/Understanding/resize-text · https://www.w3.org/WAI/WCAG22/Understanding/reflow · fluid type and zoom: https://www.smashingmagazine.com/2023/11/addressing-accessibility-concerns-fluid-type/
- Flutter Web accessibility: https://docs.flutter.dev/ui/accessibility/web-accessibility
- Google Docs canvas rendering: https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html
- troika-three-text: https://github.com/protectwise/troika/tree/main/packages/troika-three-text · msdfgen: https://github.com/Chlumsky/msdfgen
- tldraw `TextManager` (npm `@tldraw/editor` 5.6.0, `src/lib/editor/managers/TextManager/TextManager.ts`) · Excalidraw 0.18.1 (npm dist, `excalidraw-wysiwyg`)
- Capsize: https://seek-oss.github.io/capsize/ (`@capsizecss/core` 4.1.3, `@capsizecss/metrics` 4.4.0) · fontaine: https://github.com/unjs/fontaine · Utopia: https://utopia.fyi/type/calculator
- Fonts: `@fontsource-variable/inter` 5.3.0 (axes ital, opsz 14–32, wght 100–900), `@fontsource-variable/space-grotesk` 5.3.0 (wght 300–700), `@fontsource/instrument-serif` 5.3.0 (static)
- Skeletons: boneyard-js 1.10.0 https://github.com/0xGF/boneyard · react-loading-skeleton 3.5.0 · react-content-loader 7.1.2 · Layout Instability API https://wicg.github.io/layout-instability/
- weft: PLAN §3.6, §3.7, §5, §6.1, §9 · warp 01 §2 (type, motion, label anatomy), §7 · warp 05 §5 (Skeleton, SkeletonScope) · research 06, 07, 08
