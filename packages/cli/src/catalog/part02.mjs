/** Diagnostic entries in their catalog order. */
export const part02 = [
  {
    code: 'W052',
    severity: 'error',
    by: 'compiler',
    catches: '`watch` folding a stream by hand',
    fix: '`fold` + `initial` where it is read: kept in the cache',
    example:
      "import { state, watch } from '@weft-js/core'\nimport { prices } from './server/prices'\nexport function A() { const tick = prices({}); const list = state([]); watch(() => tick.value, m => { list.value = [...list.value, m] }); return <p>{list.value.length}</p> }",
  },
  {
    code: 'W053',
    severity: 'error',
    by: 'start',
    catches: '`.live()` on a query with no `tags` (dev): no mutation can ever poke it',
    fix: 'Add `tags` to the query, and the same tag to the mutations that change it',
  },
  {
    code: 'W054',
    severity: 'error',
    by: 'compiler',
    catches:
      '`media(query)` without `ssr` in a server-rendered component (hydration mismatch); a warning when `weft check` cannot tell',
    fix: 'Pass the server value: `media(query, { ssr: false })`',
    example:
      "import { media } from '@weft-js/core/browser'\nexport function A() { const dark = media('(prefers-color-scheme: dark)'); return <p>{dark.value ? 'dark' : 'light'}</p> }",
  },
  {
    code: 'W056',
    severity: 'warning',
    by: 'compiler',
    catches:
      '`watch` that copies a live value (a @weft-js/core/browser value, `.live()`) into `state`',
    fix: 'Read `live.value` directly, or `derived(() => live.value)`',
    example:
      "import { state, watch } from '@weft-js/core'\nimport { online } from '@weft-js/core/browser'\nexport function A() { const isOnline = online(); const up = state(true); watch(() => isOnline.value, v => { up.value = v }); return <p>{up.value}</p> }",
  },
  {
    code: 'W060',
    severity: 'error',
    by: 'compiler',
    catches:
      "A `group()` from @weft-js/core/style that can't be evaluated at build: a value that isn't a literal (named with its path), a `group()` outside a top-level `const`, or an accent that isn't literal tokens",
    fix: "Inline the token name or literal; define groups as `export const x = group('x', { … })`; raw CSS goes in `css: { … }`",
    example:
      "import { group } from '@weft-js/core/style'\nconst px = 13\nexport const g = group('g', { base: { pad: px } })",
  },
  {
    code: 'W061',
    severity: 'error',
    by: 'compiler',
    catches:
      "`bind:x` on a native element, or `bind:x`/`bind(box)` with something that isn't a box or that isn't a component prop",
    fix: 'Write `<Card bind:person={name} />`. A form element takes `value` and `onChange`',
    example:
      "import { bind, state } from '@weft-js/core'\nexport function A() { const n = state(1); return <input value={bind(n)} /> }",
  },
  // The design language (PLAN §6, research 37): tokens and layout where the app has warp's tokens, contrast and accessibility everywhere.
  {
    code: 'D001',
    severity: 'error',
    by: 'cli',
    catches:
      "A raw colour in `style`, app CSS, or a Tailwind arbitrary or palette class, in an app with warp's tokens: it won't follow the theme, the dials or dark mode",
    fix: "Use a colour token or a `tone`. No autofix: a token follows the theme, the raw value didn't",
  },
  {
    code: 'D002',
    severity: 'error',
    by: 'cli',
    catches:
      'Spacing off the scale, or a scale step written by hand (`padding: 16px`, `p-[13px]`, `gap-3`)',
    fix: 'A step of `hair tight related group section page`; autofix when the value is exactly one',
  },
  {
    code: 'D003',
    severity: 'warning',
    by: 'cli',
    catches: 'Raw type, radius or shadow (`font-size`, `text-lg`, `rounded-[7px]`, `box-shadow`)',
    fix: '`<Heading role>` / `<Text role>`, the radius tokens, `--warp-elevation-*`; autofix for an exact radius',
  },
  {
    code: 'D004',
    severity: 'warning',
    by: 'cli',
    catches:
      'Layout spelled out on an element (`display: flex`, `flex flex-col gap-4`) where a primitive says it',
    fix: '`<Stack>` or `<Row>`; a suggested edit when nothing else is on the element',
  },
  {
    code: 'D040',
    severity: 'warning',
    by: 'cli',
    catches:
      'The style gate (`data-weft="styled"`) on the main content or a page heading: the first paint hides what it should show',
    fix: 'Mark the secondary part that needs its late styles, or drop the marker',
  },
  {
    code: 'D041',
    severity: 'error',
    by: 'cli',
    catches:
      '`aria-label` or `aria-labelledby` on a `<div>`, `<span>` or other element whose role may not be named: screen readers drop it (axe aria-prohibited-attr)',
    fix: 'Put the words in the element (a visually hidden `<span data-part="sr-only">` keeps them off screen), or give it a role that takes a name: `role="img"` for a mark or icon that means something',
  },
  {
    code: 'D005',
    severity: 'warning',
    by: 'cli',
    catches:
      'A browser-painted control in a warp app: `<button>`, `<select>`, `<textarea>`, an input type like `date`, `number` or `range`, or a `title` tooltip',
    fix: 'The warp component: focus ring, sweep, tones and touch target come with it',
  },
  {
    code: 'D006',
    severity: 'warning',
    by: 'cli',
    catches:
      'One heading level at two roles across an app (`h1` as both `title` and `display`), or a bare `<hN>` beside `<Heading>`',
    fix: 'Drop `role`, or match the rest: `Heading` picks the role from `level`. A suggested edit at each site',
  },
  {
    code: 'D007',
    severity: 'warning',
    by: 'cli',
    catches: 'A bare `<a href>` in a warp app',
    fix: "`<Link>`, or `Shell`'s `nav` for navigation (suggested edit)",
  },
  {
    code: 'D011',
    severity: 'error',
    by: 'cli',
    catches: 'A literal text and background colour pair on one element below 4.5:1',
    fix: 'Use tokens: they pass at every dial stop',
  },
  {
    code: 'D012',
    severity: 'error',
    by: 'cli',
    catches:
      'A Content-Security-Policy that blocks inline styles, or every script a page could switch its deferred sheets on with, in an app that inlines its CSS; as a warning, one that refuses only inline scripts',
    fix: '`site: { inlineCss: false }` keeps plain links, or allow `unsafe-inline` in the directive that applies',
  },
  {
    code: 'D030',
    severity: 'error',
    by: 'cli',
    catches: 'An `<input>`, `<select>` or `<textarea>` with no label',
    fix: "A wrapping `<label>`, `<label for>`, `aria-label`, or warp's `<Input label>`",
  },
  {
    code: 'D031',
    severity: 'error',
    by: 'cli',
    catches: 'A button or link with no accessible name (icon only, or empty)',
    fix: "Text, or `aria-label`; warp's Button takes `label`",
  },
  {
    code: 'D032',
    severity: 'error',
    by: 'cli',
    catches: '`<img>` with no `alt`',
    fix: 'Describe the image; `alt=""` when it is decoration',
  },
  {
    code: 'D033',
    severity: 'error',
    by: 'cli',
    catches: '`onClick` on a non-interactive element with no role: mouse only',
    fix: 'A real `<button type="button">` (suggested edit)',
  },
  {
    code: 'D034',
    severity: 'error',
    by: 'cli',
    catches: 'A control inside a control (`<a><button>`)',
    fix: 'One control: move the other beside it',
  },
  {
    code: 'D035',
    severity: 'warning',
    by: 'cli',
    catches: 'A heading level that jumps (h1 to h3)',
    fix: 'Use the next level; `<Heading level role>` keeps the look apart from the outline',
  },
  {
    code: 'D036',
    severity: 'error',
    by: 'cli',
    catches: 'The focus ring removed with nothing in its place (`outline: none`, `outline-none`)',
    fix: "Remove it: warp's `:focus-visible` is the ring. Or add a `focus-visible:` style",
  },
  {
    code: 'D037',
    severity: 'error',
    by: 'cli',
    catches: 'A positive `tabindex`',
    fix: '`0`, and the order follows the DOM (autofix)',
  },
  {
    code: 'D038',
    severity: 'warning',
    by: 'cli',
    catches: 'Two solid Buttons side by side',
    fix: 'One primary action per region: make the others `soft` or `ghost`',
  },
  {
    code: 'D039',
    severity: 'warning',
    by: 'cli',
    catches: '`<html>` with no `lang`',
    fix: 'Set `lang`',
  },
  // Style groups (research 23 §3). D010 is warp's contrast gate (its own plugin); D040 and D081 are reserved by warp's docs.
  {
    code: 'D020',
    severity: 'warning',
    by: 'cli',
    catches:
      'Class soup: a static `class`/`className` with more than 8 classes, or the same class list (4+ classes) in two or more places',
    fix: "Extract a style group (`group('order-card', …)`, name suggested from the component) and spread it; `weft style find` first, one may already fit",
  },
  {
    code: 'D021',
    severity: 'warning',
    by: 'cli',
    catches:
      'Two style groups resolve to 90% or more of the same CSS (`similar` in .weft/styles.json)',
    fix: 'Merge them into one group with an axis for what differs',
  },
  {
    code: 'D022',
    severity: 'info',
    by: 'cli',
    catches: 'The same accent (`accent: { … }` at a call site) on one group at 3 or more sites',
    fix: 'Promote it to an axis value and pass that value at those sites',
  },
  {
    code: 'D023',
    severity: 'warning',
    by: 'cli',
    catches: 'A `css: { … }` escape (raw CSS) in a style group',
    fix: 'Use the token the fix names; keep the escape only where no intent sets the property',
  },
  {
    code: 'D024',
    severity: 'error',
    by: 'compiler',
    catches:
      "Styles that fight with no order: two group roots spread on one element; two compounds that can match at once and set one property differently, or an accent that sets what the site's own axis value sets (`weft check`)",
    fix: 'One group per element (nest an element, or make it an axis); exclusive compound `when`s; drop the accent or make it an axis value',
    example:
      "import { group } from '@weft-js/core/style'\nconst a = group('a', { base: { pad: 'group' } })\nconst b = group('b', { base: { gap: 'related' } })\nexport function X() { return <li {...a()} {...b()} /> }",
  },
  {
    code: 'D025',
    severity: 'error',
    by: 'compiler',
    catches:
      "Unknown name in a style group: an axis value, axis, state or part a call site uses that the group doesn't have, or an intent or token that isn't in the vocabulary (also a type error)",
    fix: 'Use one of the names listed (the closest come first); `weft style explain <group>` shows them all',
    example:
      "import { group } from '@weft-js/core/style'\nconst card = group('card', { axes: { status: { open: {}, late: {} } } })\nexport function X() { return <article {...card({ status: 'lost' })} /> }",
  },
  {
    code: 'T001',
    severity: 'error',
    by: 'cli',
    catches:
      'A test with no assertion (or an `expect(x)` with no matcher): it passes as long as nothing throws. `@weft-js/core/test` also fails such a test at runtime',
    fix: 'Assert what the user sees: `expect(screen.getByRole(…)).toHaveTextContent(…)`',
    example:
      "import { render } from '@weft-js/core/test'\nimport { Cart } from './Cart'\ntest('renders', () => { render(Cart) })",
  },
]
