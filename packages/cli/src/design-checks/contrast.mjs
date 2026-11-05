import { styleDecls } from './values.mjs'
import { literalColor, ratio } from './rules.mjs'

export function checkContrast({ el, report }) {
  // -- contrast of a literal pair --
  const style = el.attr('style')
  if (style) {
    const decls = styleDecls(style)
    const fg = decls.find((d) => d.prop === 'color')
    const bg = decls.find((d) => d.prop === 'background' || d.prop === 'background-color')
    const [a, b] = [fg && literalColor(fg.value), bg && literalColor(bg.value)]
    if (a && b && ratio(a, b) < 4.5)
      report(
        'D011',
        style.start,
        style.end,
        `\`${fg.value}\` on \`${bg.value}\` is ${ratio(a, b).toFixed(2)}:1; body text needs 4.5:1 (WCAG 1.4.3).`,
      )
    const none = decls.find(
      (d) =>
        (d.prop === 'outline' || d.prop === 'outline-width') && /^(none|0(px)?)$/.test(d.value),
    )
    if (none)
      report(
        'D036',
        none.start,
        none.end,
        'This removes the focus ring with nothing in its place: keyboard users lose their place (WCAG 2.4.7).',
      )
  }
  const cls = el.attr('class') ?? el.attr('className')
  if (
    cls?.kind === 'string' &&
    /(^|\s)(focus:)?outline-none(\s|$)/.test(cls.value) &&
    !/focus(-visible)?:(ring|outline(?!-none))/.test(cls.value)
  )
    report(
      'D036',
      cls.start,
      cls.end,
      '`outline-none` with no `focus-visible:` style in its place: keyboard users lose their place (WCAG 2.4.7).',
    )
}
