// Read row measurement settings from a rendered probe.
export interface Metric {
  font: string
  line: number
  wrap: number
  chrome: number
  opts: { whiteSpace: 'normal' | 'pre-wrap'; letterSpacing?: number | undefined }
}
const LONG = 'mmmm '.repeat(400)

function fontOf(c: CSSStyleDeclaration) {
  return `${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`
}

/** One row's text and everything around it, read from a real hidden row: nothing here knows warp's padding. */
export function metricOf(probe: HTMLElement): Metric | undefined {
  const box = probe.querySelector<HTMLElement>('[data-measure]')
  if (!box) return
  const c = getComputedStyle(box)
  const line = parseFloat(c.lineHeight)
  if (!line) return // `normal` has no one answer
  box.style.display = 'block'
  box.textContent = 'x'
  const chrome = probe.getBoundingClientRect().height - line
  box.textContent = LONG
  const wrap =
    box.getBoundingClientRect().width -
    (parseFloat(c.paddingInlineStart) || 0) -
    (parseFloat(c.paddingInlineEnd) || 0)
  const white = c.whiteSpaceCollapse === 'preserve' || /pre/.test(c.whiteSpace)
  return {
    font: fontOf(c),
    line,
    wrap,
    chrome,
    opts: {
      whiteSpace: white ? 'pre-wrap' : 'normal',
      letterSpacing: parseFloat(c.letterSpacing) || undefined,
    },
  }
}
