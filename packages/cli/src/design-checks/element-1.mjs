import { addImport } from './rules.mjs'
import { styleDecls, declaration, utility, layoutOf } from './values.mjs'

export function element1({ el, f, report }) {
  const style = el.attr('style')
  if (style) for (const d of styleDecls(style)) declaration(d, report)
  const cls = el.attr('class') ?? el.attr('className')
  if (cls?.kind === 'string') {
    let at = cls.valueStart + 1
    for (const c of cls.value.split(/(\s+)/)) {
      const hit = c.trim() && utility(c)
      if (hit)
        report(
          hit[0],
          at,
          at + c.length,
          hit[1],
          hit[2] ? { description: `Use ${hit[2]}`, safe: true, text: hit[2] } : undefined,
        )
      at += c.length
    }
  }
  const layout =
    /^[a-z]/.test(el.name) &&
    [
      'div',
      'section',
      'ul',
      'ol',
      'nav',
      'header',
      'footer',
      'main',
      'aside',
      'article',
      'form',
    ].includes(el.name) &&
    layoutOf(el)
  if (layout) {
    const close = f.text.lastIndexOf('</', el.end - 1)
    const selfClosed = !f.text.slice(el.start, el.end).includes(`</${el.name}`)
    const as = el.name === 'div' ? '' : ` as="${el.name}"`
    const gap = layout.gap ? ` gap="${layout.gap}"` : ''
    const sole = el.attrs.length === 1
    const fix = layout.exact &&
      sole &&
      !selfClosed && {
        description: `Use <${layout.primitive}>`,
        safe: false,
        edits: [
          {
            start: el.start + 1,
            end: el.attrs[0].end,
            text: `${layout.primitive}${as}${gap}`,
          },
          { start: close + 2, end: el.end - 1, text: layout.primitive },
          ...addImport(f.text, [layout.primitive]),
        ].sort((a, b) => b.start - a.start),
      }
    report(
      'D004',
      el.start,
      el.tagEnd,
      `Hand-rolled layout on <${el.name}>: <${layout.primitive}> says what this is and keeps the gap on the scale.`,
      fix || undefined,
    )
  }
}
