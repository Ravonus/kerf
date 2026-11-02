# 33. Surfaces: `defineSurface`, `s.text()` and `text.measure`

Status: design written first, then built (2026-10-30). This closes PLAN §5 and the "2. Surfaces" row of §9. It builds
on [04](04-keel-react-driver.md) (what the Keel driver does), [11](11-text-and-type.md) §8.5 (the X-codes),
[12](12-text-engine-slim.md) (the engine) and [13](13-plugins.md) §2.6 and §2.11 (slots and conformance). Results are
in §10.

**Goal:** a canvas is a layout child like any other. It takes live props, it never makes anything re-render, its text
stays real text, and an app with no surface pays nothing.

## 1. What changed from the plan, and why

| Plan | Now | Why |
|---|---|---|
| A `surface` package and a `text` package (§8) | **`@weft-js/core/surface`, a subpath of `weft`** | `@weft-js/core/text`, `@weft-js/core/media` and `@weft-js/core/shape` all ended up as subpaths. A subpath no app imports costs 0, which is all a package would buy |
| `s.frame(fn)` only | **`s.draw(fn)` and `s.frame(fn)`** | A chart or a HUD has no reason to run at 60 Hz. `s.draw` paints when something it read changes. `s.frame` also paints every clock tick. Both are tracked, so a paused or reduced-motion `s.frame` still redraws on a box change |
| `weft/surface/keel` in core | **`@weft-js/plugin-surface-keel`** | [13](13-plugins.md) §2.9 moved it, and a third `surface.renderer` provider tests the slot. The licence question in §5 is answered: keel-engine is MIT, by the same author, and the plugin keeps the notice |
| `measure()`, `lines()`, `fit()` in this phase | **Not built** | Nothing here needs them: `s.text()` talks to the slot, and `<Text reserve>` needs no measuring ([31](31-query-shapes.md)). Their first users are the virtualised lists in 3c, which is where they belong |
| X003/X004 owned by `@weft-js/text` | **Reported by `s.text()`** | The consumer holds the mirror's computed style, and both engines share one prediction model, so a per-plugin list has nothing to vary |
| X010 needs a `s.decorative()` escape | **Kept:** `s.decorative(fn)` just calls `fn`, and `weft check` skips its body | A runtime no-op whose only job is to state intent to the checker |
| X012 "opts out of the fallback" | **There's no opt-out to take.** X012 catches the CSS that would defeat it: `forced-color-adjust: none`, or a print rule hiding the mirror | An option that exists only to be flagged is a design bug |
| X009 | **Never defined, so it's defined here:** a `<Surface>` with neither `label` nor `decorative` | That's the gap between X008 and X010: canvas content with no accessible name at all. X007 stays undefined ([26](26-phase-2-completion.md) §7) |

## 2. The API

```tsx
import { defineSurface, Surface } from '@weft-js/core/surface'

export const Bars = defineSurface({
  name: 'bars',
  kind: 'canvas2d',                               // 'canvas2d' | 'webgl2' | a surface.renderer key
  props: z.object({ data: z.array(z.number()) }), // or defineSurface<{ data: number[] }>({ ... })
  setup(s, props) {                               // once, on the client; props are live
    const title = s.text(() => `${props.data.length} bars`, { x: 8, y: 8, width: 200, font: '14px Inter', lineHeight: 20 })
    s.draw(() => { /* reads props.data, s.size.value, s.tokens.accent.css */ })
    return () => {}                               // optional cleanup
  },
})

<Surface use={Bars} data={rows.value} aspect="16/9" label="Sales by month" />
```

| `s.` | What |
|---|---|
| `canvas`, `el` | The canvas and its host element. Pointer handlers go on `el`, since mirrors sit above the canvas |
| `ctx` / `gl` | The context of the kind. Providers add their own (`px` for `keel-pixel`) |
| `size`, `dpr`, `scale` | Boxes. `size` is CSS px (or target px for `pixel`), from a ResizeObserver |
| `clock` | The shared clock |
| `tokens` | Live colours: `s.tokens.accent.css` and `.linear`. Reads are tracked |
| `draw(fn)`, `frame(fn)`, `invalidate()` | Paint when read boxes change / on every tick as well / once by hand |
| `text(text, opts)`, `decorative(fn)` | Text with a mirror / text with none, on purpose |

`defineSurface` options: `pixel: { width, height }` (fixed target, integer scale, nearest sampling), `fps`, `maxDpr`
(default 2), `clear: false` (keep the last frame; `canvas2d`).

Why props are a Zod object *or* a type parameter: Zod runs only in dev, but `z.object()` is a call, so it stays in a
prod bundle. Apps that already ship Zod lose nothing; others can use the type parameter. Stripping `props:` in the
compiler would fix this properly, and isn't built.

## 3. One paint, tracked, on a frame

All of a surface's `draw` and `frame` callbacks and its text form one **paint**. The rule that makes this fine-grained:
a paint reads boxes; when one changes, one paint is scheduled on the next frame. Nothing else runs.

The natural way to write that needs a "tracked now, re-run later" primitive that core doesn't have. It can be done with
none, so core is untouched:

```ts
const tick = state(0)
effect(() => {
  tick.value                          // a frame asks for a paint by writing this
  if (painting) paintAll()            // tracked: this run's reads are the new dependencies
  else invalidate()                   // a source changed: book a frame. Reads nothing, so it fires only once
}, () => {})
```

The price is a second effect run per change, so `touches()` reports 2 runs and 0 DOM writes. Several writes in one
frame still give one paint, which a plain effect (a paint per microtask) wouldn't: that matters at 1000 Hz pointers.

The clock is one `requestAnimationFrame` loop shared by all surfaces, started while one is animating. Time comes from
capped deltas, so a backgrounded tab resumes without a jump. Each surface derives `frame = floor(seconds × fps)` and
paints when that changes, which keeps Keel's guarantee: same seed and frame, same pixels. `clock.seek(s)` paints every
animated surface synchronously. `prefers-reduced-motion: reduce` keeps the clock paused at the first frame, and an
explicit `clock.play()` overrides it. A surface that's off screen skips its paints.

**WebGL context loss:** `webglcontextlost` is cancelled so the context can come back, and on `webglcontextrestored`
`setup` runs again in a fresh scope.

## 4. SSR and layout

The server renders the host, `<div data-surface style="aspect-ratio:16/9">`, and nothing else. The canvas is made in
`onMount` and appended, so hydration has no extra node to match and the placeholder reserves the space (CLS 0). A
`pixel` surface takes its aspect from its target size. The `Surface` body never reads a prop's value: `aspect`, `class`
and `style` are single bindings, and everything else is `setup`'s.

## 5. `surface.renderer@1`

```ts
interface SurfaceRenderer { context(canvas, def): { ctx?, gl?, [provider field]?, resize?(w, h, dpr), begin?(), dispose?() } }
```

`canvas2d` and `webgl2` are inline in `@weft-js/core/surface`: each is a few lines, and lazy chunks would cost more. Any other
kind goes through `load(key)` from `weft:slot/surface.renderer`, so it's only a dynamic import edge until used.

`@weft-js/core/vite` now resolves `weft:slot/text.measure` and `weft:slot/surface.renderer` to a throwing stub when
`.weft/slots/` has no file, because `@weft-js/core/surface` must build in an app that never ran `weft plugins sync` and never
calls `s.text()`. Slots no consumer in core imports keep the hard P101 error.

## 6. `text.measure@1`

`@weft-js/text` now provides it unless `measure: 'off'`. `engine: 'slim'` (default) is `@weft-js/text/engine`, and
`engine: 'pretext'` is pinned upstream. Both are behind `import()`, so installing the plugin stays free (P114).

The contract is `prepare`, `layout`, `lines`, `lineText`, `clear`. `lineText` joins the four calls of research 12
because painting needs strings.

**A change to the slim engine.** `lineText` needed `{ segments: true }`, which sent all text to the exact tier: every
`s.text()` page would load 18–19 KB for text the 8 KB lite tier can lay out. A lite handle now keeps its collapsed text
and each segment's start when asked, so `lineText` is a `slice`. Line breaks are unchanged, and the accuracy run is
what proves it (§10).

**Conformance** lives in `@weft-js/core/test/plugins`, with the slot, as research 13 §2.11 says. `textMeasureSuite(provider,
{ corpora })` runs in the page: accuracy against the DOM (0 mismatches on Latin, emoji, Arabic; ≤ 0.5% on CJK), purity
(no layout-forcing DOM reads in `layout`), speed (`layout` over 1k ≤ 0.5 ms, `prepare` over 1k ≤ 15 ms) and fonts
(results after `clear()` match). `packages/text/test/conformance.mjs` runs it for both engines in Chrome and
WebKit, and against deliberately bad providers, so the suite is shown to fail.

## 7. `s.text()` and the mirror

`s.text(text, opts)` creates a real element at once, in the host, positioned over the text's box:
`<p data-surface-text style="left:…;top:…;width:…;font:…;color:transparent">`. Then:

- **One DOM write per change:** an effect sets `textContent`.
- **The canvas reads the mirror**, not the source string. A MutationObserver on it invalidates the paint, so a browser
  translation repaints the canvas in the new language. Selection and find work on the real, transparent text.
- **Wrap and font come from the mirror too:** the font string is built from its computed style unless `font` is given,
  and `font` is written to the mirror, so CSS and canvas can't disagree.
- **Forced colours and print:** a small stylesheet, added once, makes mirrors visible in `CanvasText`. The paint skips
  `fillText` while `(forced-colors: active), print` matches, so the text isn't drawn twice.
- **Fonts:** `document.fonts.load(font)` runs first, and `loadingdone` clears the provider and repaints: fallback first,
  re-measured once. With no provider loaded yet the mirror is already there and the paint draws no text.
- **On `webgl2` and provider kinds** there is no text path. The mirror itself becomes visible: real DOM text over the
  canvas, at the same coordinates. A GL text path can come later and this contract won't change.
- **`exact: false`** turns off X001 and X004 for a node you know is approximate.

**Testing:** `render(<App />, {}, { slots: { 'text.measure': fakeMeasure() } })`, and `@weft-js/core/test` gives jsdom a recording
canvas (`canvasCalls(canvas)`), since jsdom has no 2D context.

## 8. Diagnostics

| Code | Sev | By | Catches |
|---|---|---|---|
| X001 | warning | runtime | The mirror's rendered height differs from the predicted height by over 1 px |
| X002 | warning | cli + runtime | `system-ui`, `-apple-system` or a generic-only family on a measured `s.text()` |
| X003 | warning | runtime | `s.text()` prepared while its font isn't loaded and there's no `"<Family> Fallback"` face |
| X004 | warning | runtime | The mirror's style can't be predicted: `text-wrap: balance\|pretty`, `hyphens: auto`, `word-spacing`, `font-feature-settings`, `font-variant-numeric`, `font-variation-settings` |
| X009 | error | cli | `<Surface>` with neither `label` nor `decorative` |
| X010 | error | cli | `fillText`/`strokeText` in a surface file outside `s.text()`/`s.decorative()` |
| X011 | error | cli + runtime | The mirror is hidden from assistive tech (`aria-hidden` on `<Surface>`, `display: none` or `visibility: hidden` on `[data-surface-text]`) |
| X012 | error | cli | CSS that defeats the fallback: `forced-color-adjust: none` on a surface, or a print rule hiding the mirror |
| X040 | warning | cli | Per-grapheme spans over a string known to exceed 200 graphemes |
| X041 | warning | cli | Per-character spans without `aria-hidden`, or a parent with no accessible name |

**Known limit:** X040 only sees literals and `const` strings. A `.map` over a live string has an unknown length, and
flagging all of them would flag every short animated label, so it stays quiet.

P101 fires statically too: `s.text()`, or a `kind` nothing provides, at the user's line.

## 9. Agents

`weft docs surface`, a line in AGENTS.md, and `weft surfaces --json` (MCP `surfaces`) listing each `defineSurface` in the
project with its name, kind, props and file, which is PLAN §5's "listed by the MCP catalog". The list is read statically,
so it needs no build.

## 10. Results

**Fine-grained updates.** Three box writes in one frame gave 1 paint, 0 DOM mutations and 0 re-renders, in Chrome and
WebKit (`packages/plugin-surface-keel/test/e2e.mjs`).

**Keel.** `@weft-js/plugin-surface-keel` wraps keel-engine's renderer, vendored with its MIT notice. The ported demo's
canvas hashes equal to the same renderer driven directly. The same frame gives the same pixels, a 256×144 target
scales to 512×288 at integer scale, and the clock starts paused under reduced motion.

**Conformance.** `slim` and `pretext` pass in Chrome and WebKit, with 0 mismatches on Latin, emoji and Arabic. Chrome
differs on 4 of 2000 CJK heights (within the 0.5% allowed) and WebKit on none. Three deliberately bad providers
(`guesses`, `impure`, `stale`) are each caught by the check meant for them.

**The accuracy corpus**, rerun after the lite tier change (§6): the fork differs from upstream on 0 paragraphs across
all 7 corpora, with 0 mismatched lines, in Chrome and WebKit.

**Size (br).** Apps with no surface: hello 1.24, runtime 6.68 and v3 shop 4.46 KB, identical to `main` at `ed21fd7`, so
**0** for an app with no surface.

| Added | Cost | When |
|---|---|---|
| `<Surface>`, canvas2d | 4.2 KB (6.25 against 2.04 for the same page without it) | In the page's bundle |
| `<Surface>`, webgl2 | 4.2 KB (6.24) | In the page's bundle |
| Slim engine, Blink | 7.9 KB, or 6.2 KB exact plus a ~4.5 KB shared chunk | Lazy, on the first `s.text()` |
| Script packs | up to 12.6 KB | Lazy, for text that needs them |
| Keel renderer | 25.9 KB | Lazy, on the first `keel-pixel` surface |

**Exit check: met** ([result](../../evals/results/surfaces-exit.md); rerun with `node evals/surfaces-exit.mjs`). A fresh
agent given "Add an animated starfield to the home page, with a slider that sets how dense it is." made `src/starfield.tsx`
and edited the route in 3 tool calls. All 8 hidden checks passed, with `weft check` clean, no type errors in the app's
source and a clean build. 9 type errors came from linked packages, not from the agent's code. Its notes on the docs: no
example of one live prop (added to `weft docs surface`), and warp has no slider.

**What the tests found.**

- *WebKit kept a resolved font.* The slim engine failed the fonts check there, with 633 of 1000 heights stale, because
  the lite tier held a canvas context that had already resolved the fallback face. `clearLite` now drops the context.
- *Cached empty lines.* A paint before the exact tier loaded cached `[]`, so text sometimes never appeared. Lines are
  now dropped on `handle.ready`.
- *Emulated dpr.* `devicePixelContentBoxSize` can be in other units from `devicePixelRatio`, so it's only trusted when
  within 2 px of width × dpr.
- *Packs shaken away.* Vite cut the lazy script packs to 1 byte, because `dist` wasn't in `sideEffects`. It is now, and
  the e2e checks bundled Arabic and CJK in both browsers.
- *`setup` painted twice.* A `draw` registered in `setup` booked a second paint. It now books one only after the first
  paint. A surface mounted after `clock.seek` starts at that frame, not frame 0.

**Not built:** `measure()`, `lines()` and `fit()` (§1), a GL text path (§7), and stripping `props:` from prod bundles,
so a Zod `props` stays in them (§2). Forced colours are checked in Chrome only, since Playwright can't emulate them in
WebKit.
