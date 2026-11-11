/** design diagnostic entries in catalog order. */
export const design = [
  // The design language (PLAN §6, research 37): tokens and layout where the app has veneer's tokens, contrast and accessibility everywhere.
  {
    code: 'D001',
    severity: 'error',
    by: 'cli',
    catches:
      "A raw colour in `style`, app CSS, or a Tailwind arbitrary or palette class, in an app with veneer's tokens: it won't follow the theme, the dials or dark mode",
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
    fix: '`<Heading role>` / `<Text role>`, the radius tokens, `--veneer-elevation-*`; autofix for an exact radius',
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
      'The style gate (`data-kerf="styled"`) on the main content or a page heading: the first paint hides what it should show',
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
      'A browser-painted control in a veneer app: `<button>`, `<select>`, `<textarea>`, an input type like `date`, `number` or `range`, or a `title` tooltip',
    fix: 'The veneer component: focus ring, sweep, tones and touch target come with it',
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
    catches: 'A bare `<a href>` in a veneer app',
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
    fix: "A wrapping `<label>`, `<label for>`, `aria-label`, or veneer's `<Input label>`",
  },
  {
    code: 'D031',
    severity: 'error',
    by: 'cli',
    catches: 'A button or link with no accessible name (icon only, or empty)',
    fix: "Text, or `aria-label`; veneer's Button takes `label`",
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
    fix: "Remove it: veneer's `:focus-visible` is the ring. Or add a `focus-visible:` style",
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
]
