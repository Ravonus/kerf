/** text diagnostic entries in catalog order. */
export const text = [
  // Text, type and skeletons (research 11 §8.5; research 26 §7; research 31 §7). `cli`: kerf check (text-checks.mjs).
  {
    code: 'X001',
    severity: 'warning',
    by: 'runtime',
    catches:
      '`s.text()` predicted one height and its DOM mirror renders another: `font`, `lineHeight` or `width` differs from the CSS',
    fix: 'Drop `font` and `lineHeight` so they come from CSS, or make them match; the message names the values',
  },
  {
    code: 'X002',
    severity: 'warning',
    by: 'cli',
    catches:
      '`system-ui`, `-apple-system` or a generic-only family on a measured `s.text()`: canvas and CSS can resolve it differently (also checked in dev, for fonts that come from CSS)',
    fix: 'Name a family',
  },
  {
    code: 'X003',
    severity: 'warning',
    by: 'runtime',
    catches:
      '`s.text()` prepared while its font isn\'t loaded and no `"<Family> Fallback"` face exists: it\'s measured on another font until the swap',
    fix: 'Declare the font in `text({ fonts })`, which generates the fallback',
  },
  {
    code: 'X004',
    severity: 'warning',
    by: 'runtime',
    catches:
      "A surface text mirror uses a style line breaking can't predict: `text-wrap: balance|pretty`, `hyphens: auto`, `word-spacing`, `letter-spacing`, `font-feature-settings`, `font-variant-numeric`, `font-variation-settings`",
    fix: 'Drop the style, or pass `exact: false`',
  },
  {
    code: 'X005',
    severity: 'error',
    by: 'cli',
    catches:
      "`font-size` in `vw`/`vi`/`cqi`/`cqw` with no `rem` term: zoom and the user's font size don't change it (WCAG 1.4.4)",
    fix: '`clamp(rem, rem + cqi, rem)`; the suggestion keeps the same sizes at 375 and 1280 px',
  },
  {
    code: 'X006',
    severity: 'error',
    by: 'cli',
    catches:
      'A fluid `clamp()` font size whose max/min is over 2.5: 200% zoom no longer doubles it',
    fix: 'Narrow the range (raise the minimum or lower the maximum)',
  },
  {
    code: 'X008',
    severity: 'error',
    by: 'cli',
    catches: 'Viewport meta with `user-scalable=no` or `maximum-scale` under 2: blocks pinch zoom',
    fix: 'Remove them (autofix)',
  },
  {
    code: 'X009',
    severity: 'error',
    by: 'cli',
    catches:
      '`<Surface>` with neither `label` nor `decorative`: a screen reader finds an unnamed image',
    fix: 'Add `label`, or `decorative` if it shows nothing a reader needs',
  },
  {
    code: 'X010',
    severity: 'error',
    by: 'cli',
    catches:
      '`fillText` or `strokeText` in a surface: text only the canvas knows, with no selection, find, translation or screen reader',
    fix: 'Use `s.text()`, or wrap it in `s.decorative()` if it is truly decoration',
  },
  {
    code: 'X011',
    severity: 'error',
    by: 'cli',
    catches:
      'A surface text mirror hidden from assistive tech: `aria-hidden` on `<Surface>` or `s.el`, or `display: none`/`visibility: hidden` on `[data-surface-text]` (also checked in dev)',
    fix: 'Leave the mirror to kerf; use `decorative` for a surface with nothing to read',
  },
  {
    code: 'X012',
    severity: 'error',
    by: 'cli',
    catches:
      "CSS that defeats a surface's text fallback: `forced-color-adjust: none`, or a print rule hiding `[data-surface-text]`",
    fix: 'Remove it: the mirror is what forced-colours mode and print show',
  },
  {
    code: 'X020',
    severity: 'warning',
    by: 'cli',
    catches:
      'A hand-written `@font-face` for a local file with no `"<Family> Fallback"` face: the font swap shifts layout',
    fix: 'Declare the font in `text({ fonts })` (@kerf-js/text), which generates a metric-matched fallback',
  },
  {
    code: 'X021',
    severity: 'error',
    by: 'cli',
    catches: '`font-display: block` or `auto`: text is invisible while the font loads',
    fix: '`swap` (autofix), or `optional` for faces that may skip',
  },
  {
    code: 'X022',
    severity: 'warning',
    by: 'cli',
    catches:
      "A local `@font-face` without `unicode-range` (not subset), or the font build's preloads over the 100 KB budget",
    fix: '`text({ fonts })` subsets every face; preload fewer faces',
  },
  {
    code: 'X023',
    severity: 'warning',
    by: 'cli',
    catches: 'A `<link rel="preload" as="font">` whose file no `@font-face` uses',
    fix: 'Remove the preload',
  },
  {
    code: 'X030',
    severity: 'error',
    by: 'cli',
    catches:
      '`<img>`, `<video>` or `<iframe>` without `width`/`height` or `aspect-ratio` inside a `<Boundary>`: it lands at 0 px and pushes content down',
    fix: '`<Media src={x}>` with a `?media` import (it always has dimensions), or set `width` and `height`',
  },
  {
    code: 'X031',
    severity: 'warning',
    by: 'runtime',
    catches:
      "A `pending` fallback whose box differs from the content's by more than 1 px at the swap (measured by `<Boundary>` in dev)",
    fix: "Size the fallback like the content: veneer's `<Shape>` with the content's counts",
  },
  {
    code: 'X032',
    severity: 'warning',
    by: 'runtime',
    catches:
      'A skeleton repeats a list with no count hint: no `limit` input, no `.max()` on the array, nothing seen yet. It shows 5 rows, so the swap can shift',
    fix: 'Add a `limit` input or `.max()` to the array in `output`',
  },
  {
    code: 'X033',
    severity: 'warning',
    by: 'cli',
    catches:
      '`x.pending` renders a skeleton or spinner with no check that `x` has no value: every refetch flashes it',
    fix: 'Let `<Boundary>` show first loads, and test `x.value === undefined` here. A refetch keeps the old value in place',
  },
  {
    code: 'X034',
    severity: 'error',
    by: 'cli',
    catches:
      'A `pending` fallback with its own `setTimeout`/`setInterval`: `<Boundary>` already owns the 150 ms / 400 ms timing',
    fix: 'Remove the timers from the fallback',
  },
  {
    code: 'X040',
    severity: 'warning',
    by: 'cli',
    catches: 'Per-grapheme DOM spans over a string known to exceed 200 graphemes',
    fix: 'Use word-level motion or a Surface',
  },
  {
    code: 'X041',
    severity: 'warning',
    by: 'cli',
    catches:
      'Per-character spans without `aria-hidden`, or a parent with no accessible name: a screen reader spells the word out',
    fix: '`aria-hidden` on each span and `aria-label` with the whole text on the parent',
  },
  // Media (research 15 §7.5, static rules in research 26 §2.5): reported by @kerf-js/media's check hook.
  {
    code: 'X035',
    severity: 'warning',
    by: 'cli',
    catches:
      'Streamed text written straight into a scroll container: a reflowing tail moves the lines above it',
    fix: 'Render it with `<Text stream>` from @kerf-js/core/text: the height only grows',
  },
  {
    code: 'X036',
    severity: 'warning',
    by: 'runtime',
    catches: 'A skeleton shows a string from `output` with no length hint, so its bar is a guess',
    fix: "Add `.max()`, `.length()` or `.meta({ example })` to the schema, or an example in the query's `shape`",
  },
  {
    code: 'X037',
    severity: 'warning',
    by: 'cli',
    catches:
      'A `resource` or query made in the component that renders the `<Boundary>` meant to wait for it, and read inside it: the Boundary only waits for what its children make, so no fallback shows',
    fix: 'Make it in a small component rendered inside the Boundary',
  },
]
