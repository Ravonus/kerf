import { STATIC, INTERACTIVE } from './rules.mjs'

export function element6({ el, f, report }) {
  // -- behaviour on the wrong element --
  if (
    STATIC.has(el.name) &&
    el.attr('onClick') &&
    !el.attr('role') &&
    !el.attr('tabindex') &&
    !el.attr('tabIndex')
  ) {
    const swap =
      (el.name === 'div' || el.name === 'span') &&
      f.text.slice(el.start, el.end).includes(`</${el.name}`)
    report(
      'D033',
      el.start,
      el.tagEnd,
      `onClick on <${el.name}>: no keyboard, no focus, no role, so it only works with a mouse (WCAG 2.1.1).`,
      swap
        ? {
            description: 'Use a real button',
            safe: false,
            edits: [
              { start: el.start + 1, end: el.tagEnd, text: 'button type="button"' },
              {
                start: f.text.lastIndexOf('</', el.end - 1) + 2,
                end: el.end - 1,
                text: 'button',
              },
            ].sort((a, b) => b.start - a.start),
          }
        : undefined,
    )
  }
  if (INTERACTIVE.has(el.name) && el.ancestors.some((a) => INTERACTIVE.has(a) && a !== 'label')) {
    const parent = [...el.ancestors].reverse().find((a) => INTERACTIVE.has(a))
    report(
      'D034',
      el.start,
      el.tagEnd,
      `<${el.name}> inside <${parent}>: nested controls don't reach the keyboard and screen readers merge them.`,
    )
  }
  const tabindex = el.attr('tabindex') ?? el.attr('tabIndex')
  const tab =
    tabindex?.kind === 'string'
      ? Number(tabindex.value)
      : tabindex?.kind === 'expr'
        ? Number(tabindex.expr)
        : 0
  if (tab > 0)
    report(
      'D037',
      tabindex.start,
      tabindex.end,
      `\`tabindex="${tab}"\` jumps the page's tab order (WCAG 2.4.3).`,
      {
        description: 'Use tabindex 0',
        safe: true,
        text: tabindex.kind === 'string' ? '"0"' : '0',
        at: [tabindex.valueStart, tabindex.valueEnd],
      },
    )
}
