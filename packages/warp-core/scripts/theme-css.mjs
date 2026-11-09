/** Theme wrappers understood by the legacy lowering pass. */
export const themeNames = [
  '--_warp-button-bg-hover',
  '--_warp-button-bg-focus',
  '--_warp-button-bg-press',
  '--_warp-button-bg-disabled',
  '--_warp-button-text-hover',
  '--_warp-button-text-focus',
  '--_warp-button-text-press',
  '--_warp-button-text-disabled',
  '--warp-button-bg',
  '--warp-config-part-button-bg',
  '--warp-button-text',
  '--warp-config-part-button-text',
  '--warp-button-border',
  '--warp-config-part-button-border',
  '--warp-button-highlight',
  '--warp-config-part-button-highlight',
  '--warp-tabs-text',
  '--warp-config-part-tabs-text',
  '--warp-tabs-text-hover',
  '--warp-config-part-tabs-text-hover',
  '--warp-tabs-text-active',
  '--warp-config-part-tabs-text-active',
  '--warp-tabs-underline',
  '--warp-config-part-tabs-underline',
  '--warp-link-text',
  '--warp-config-part-link-text',
  '--warp-pill-border',
  '--warp-config-part-pill-border',
  '--warp-pill-bg',
  '--warp-config-part-pill-bg',
  '--warp-pill-text',
  '--warp-config-part-pill-text',
  '--warp-pill-text-hover',
  '--warp-config-part-pill-text-hover',
  '--warp-pill-bg-active',
  '--warp-config-part-pill-bg-active',
  '--warp-pill-text-active',
  '--warp-config-part-pill-text-active',
  '--warp-pill-border-active',
  '--warp-config-part-pill-border-active',
  '--warp-nav-text',
  '--warp-config-part-nav-text',
  '--warp-nav-underline',
  '--warp-config-part-nav-underline',
  '--warp-sweep-base',
  '--warp-config-part-sweep-base',
  '--warp-sweep-stroke',
  '--warp-config-part-sweep-stroke',
  '--warp-sweep-stroke-invalid',
  '--warp-config-part-sweep-stroke-invalid',
  '--warp-sweep-label',
  '--warp-config-part-sweep-label',
  '--warp-sweep-text',
  '--warp-config-part-sweep-text',
  '--warp-field-label',
  '--warp-config-part-field-label',
  '--warp-field-label-floated',
  '--warp-config-part-field-label-floated',
  '--warp-field-label-interaction',
  '--warp-config-part-field-label-interaction',
  '--warp-field-label-invalid',
  '--warp-config-part-field-label-invalid',
  '--warp-link-underline',
  '--warp-config-part-link-underline',
  '--warp-nav-text-interaction',
  '--warp-config-part-nav-text-interaction',
]

const systemTokens = [
  'elevation-0',
  'elevation-1',
  'elevation-2',
  'elevation-3',
  'font-display',
  'font-mono',
  'font-sans',
  'frame-duration',
  'radius-control',
  'radius-mark',
  'radius-round',
  'radius-surface',
  'space-group',
  'space-hair',
  'space-page',
  'space-related',
  'space-section',
  'space-tight',
  'spring-duration',
  'sweep-duration',
  'text-body-font',
  'text-body-leading',
  'text-body-size',
  'text-body-weight',
  'text-button-case',
  'text-button-font',
  'text-button-leading',
  'text-button-size',
  'text-button-tracking',
  'text-button-weight',
  'text-caption-leading',
  'text-caption-size',
  'text-code-font',
  'text-code-leading',
  'text-code-size',
  'text-display-font',
  'text-display-leading',
  'text-display-size',
  'text-display-tracking',
  'text-display-weight',
  'text-heading-font',
  'text-heading-leading',
  'text-heading-size',
  'text-heading-tracking',
  'text-heading-weight',
  'text-label-case',
  'text-label-font',
  'text-label-leading',
  'text-label-size',
  'text-label-tracking',
  'text-label-weight',
  'text-title-font',
  'text-title-leading',
  'text-title-size',
  'text-title-tracking',
  'text-title-weight',
]
const buttonProperties = [
  'gap',
  'padding-inline',
  'border-width',
  'radius',
  'font-family',
  'font-size',
  'font-weight',
  'font-letter-spacing',
]
themeNames.push(
  ...systemTokens.map((name) => `--warp-config-system-${name}`),
  ...buttonProperties.flatMap((name) => [
    `--warp-button-${name}`,
    `--warp-config-part-button-${name}`,
  ]),
)

// Lower only explicitly named theme wrappers, preserving every byte of their fallbacks.
export function lowerTheme(css, names) {
  const startMarker = '/* warp-theme-only:start */'
  const endMarker = '/* warp-theme-only:end */\n'
  while (css.includes(startMarker)) {
    const start = css.indexOf(startMarker)
    const end = css.indexOf(endMarker, start + startMarker.length)
    if (end < 0) throw new Error('Unclosed theme-only block')
    css = css.slice(0, start) + css.slice(end + endMarker.length)
  }
  if (css.includes(endMarker)) throw new Error('Unexpected theme-only end')
  const allowed = new Set(names)
  function lower(start, end) {
    let result = ''
    for (let i = start; i < end;) {
      if (css.startsWith('/*', i)) {
        const close = css.indexOf('*/', i + 2)
        if (close < 0 || close + 2 > end) throw new Error('Unclosed CSS comment')
        result += css.slice(i, close + 2)
        i = close + 2
      } else if (css[i] === '"' || css[i] === "'") {
        const quote = css[i]
        let j = i + 1
        while (j < end && css[j] !== quote) j += css[j] === '\\' ? 2 : 1
        if (j >= end) throw new Error('Unclosed CSS string')
        result += css.slice(i, j + 1)
        i = j + 1
      } else if (css.startsWith('var(', i) && (i === 0 || !/[\w-]/.test(css[i - 1]))) {
        const call = parseCall(i, end)
        if (allowed.has(call.name)) {
          if (call.comma < 0 || !css.slice(call.comma + 1, call.end).trim())
            throw new Error(`Missing fallback for ${call.name}`)
          result += lower(call.comma + 1, call.end)
        } else result += css.slice(i, i + 4) + lower(i + 4, call.end) + ')'
        i = call.end + 1
      } else result += css[i++]
    }
    return result
  }
  function parseCall(start, end) {
    let depth = 1,
      comma = -1,
      quote = '',
      comment = false
    for (let i = start + 4; i < end; i++) {
      if (comment) {
        if (css.startsWith('*/', i)) {
          comment = false
          i++
        }
      } else if (quote) {
        if (css[i] === '\\') i++
        else if (css[i] === quote) quote = ''
      } else if (css.startsWith('/*', i)) {
        comment = true
        i++
      } else if (css[i] === '"' || css[i] === "'") quote = css[i]
      else if (css[i] === '(') depth++
      else if (css[i] === ')') {
        if (--depth === 0)
          return { name: css.slice(start + 4, comma < 0 ? i : comma).trim(), comma, end: i }
      } else if (css[i] === ',' && depth === 1 && comma < 0) comma = i
    }
    throw new Error('Unclosed CSS var()')
  }
  return lower(0, css.length)
}
