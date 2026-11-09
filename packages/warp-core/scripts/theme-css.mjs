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
  'text-display-variation',
  'text-prose-size',
  'text-prose-leading',
  'text-eyebrow-font',
  'text-eyebrow-size',
  'text-eyebrow-leading',
  'text-eyebrow-weight',
  'text-eyebrow-tracking',
  'text-eyebrow-case',
  'text-control-leading',
  'text-control-size',
  'duration-instant',
  'duration-fast',
  'duration-base',
  'duration-slow',
  'fill-duration',
  'label-char-duration',
  'label-float-duration',
  'message-duration',
  'touch-out',
  'duration-route',
  'duration-push',
  'duration-sheet',
  'arrive-duration',
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

const partProperties = {
  button: ['shadow', 'shadow-hover', 'shadow-press', 'duration', 'scale-press'],
  nav: ['gap', 'underline-width'],
  tabs: ['gap', 'underline-width'],
  link: ['underline-width', 'underline-offset'],
  pill: [
    'gap',
    'gap-hover',
    'gap-active',
    'height',
    'padding-inline',
    'border-width',
    'radius',
    'font-family',
    'font-size',
    'font-weight',
    'font-line-height',
  ],
  field: ['gap', 'radius'],
  card: ['gap', 'padding', 'radius', 'shadow', 'shadow-hover'],
}
themeNames.push(
  ...Object.entries(partProperties).flatMap(([part, names]) =>
    names.flatMap((name) => [`--warp-${part}-${name}`, `--warp-config-part-${part}-${name}`]),
  ),
  '--_warp-button-duration',
  '--_warp-button-duration-press-time',
  '--_warp-button-shadow-press',
  '--_warp-field-radius',
  '--_warp-field-border-width',
  '--warp-link-radius',
  '--warp-config-part-link-radius',
  '--warp-link-font-weight',
  '--warp-config-part-link-font-weight',
  '--_warp-nav-padding-block',
  '--_warp-nav-padding-block-hover',
  '--_warp-nav-padding-block-active',
  '--_warp-nav-duration',
  '--_warp-nav-gap-hover',
  '--_warp-nav-gap-active',
  '--_warp-nav-underline-width-hover',
  '--_warp-nav-underline-width-active',
  '--_warp-link-duration',
  '--_warp-link-text-hover',
  '--_warp-link-text-focus',
  '--_warp-link-text-press',
  '--_warp-link-underline-hover',
  '--_warp-link-underline-focus',
  '--_warp-link-underline-press',
  '--_warp-link-underline-width-hover',
  '--_warp-link-underline-width-focus',
  '--_warp-link-underline-width-press',
  '--_warp-link-underline-offset-hover',
  '--_warp-link-underline-offset-focus',
  '--_warp-link-underline-offset-press',

  '--_warp-link-radius-hover',
  '--_warp-link-radius-press',
  '--_warp-link-font-weight-hover',
  '--_warp-link-font-weight-press',
  '--_warp-card-gap-hover',
  '--_warp-card-gap',
  '--_warp-card-padding',
  '--_warp-card-radius',
  '--_warp-card-shadow',
  '--_warp-card-font-size',
  '--_warp-card-font-weight',

  '--_warp-card-padding-hover',
  '--_warp-card-radius-hover',
  '--_warp-pill-duration',

  '--_warp-field-gap',
  '--_warp-field-height',
  '--_warp-field-padding-inline',
  '--_warp-field-font-family',
  '--_warp-field-font-size',
  '--_warp-field-duration',

  '--_warp-sweep-width',
  '--_warp-sweep-duration',
  '--_warp-tabs-underline-width',
  '--_warp-tabs-gap',
  '--_warp-tabs-border-width',
  '--_warp-tabs-border-width-hover',
  '--_warp-tabs-border-width-active',
  '--_warp-tabs-shadow',
  '--_warp-tabs-shadow-hover',
  '--_warp-tabs-shadow-active',

  '--_warp-tabs-padding-inline',
  '--_warp-tabs-radius',
  '--_warp-tabs-font-family',
  '--_warp-tabs-font-size',
  '--_warp-tabs-font-weight',
  '--_warp-tabs-height',
  '--_warp-tabs-duration',
  '--_warp-tabs-padding-inline-hover',
  '--_warp-tabs-padding-inline-active',
  '--_warp-tabs-radius-hover',
  '--_warp-tabs-radius-active',
  '--_warp-tabs-font-family-hover',
  '--_warp-tabs-font-family-active',
  '--_warp-tabs-font-size-hover',
  '--_warp-tabs-font-size-active',
  '--_warp-tabs-font-weight-hover',
  '--_warp-tabs-font-weight-active',
  '--_warp-tabs-height-hover',
  '--_warp-tabs-height-active',

  '--_warp-pill-gap-hover',
  '--_warp-pill-gap-active',
)

const stateProperties = {
  button: [
    'gap',
    'padding-inline',
    'border-width',
    'radius',
    'font-family',
    'font-size',
    'font-weight',
    'font-letter-spacing',
  ],
  pill: [
    'height',
    'padding-inline',
    'border-width',
    'radius',
    'font-family',
    'font-size',
    'font-weight',
    'font-line-height',
  ],
}
for (const [part, properties] of Object.entries(stateProperties)) {
  const states = part === 'button' ? ['hover', 'press'] : ['hover', 'active']
  themeNames.push(
    ...properties.flatMap((property) =>
      states.map((state) => `--_warp-${part}-${property}-${state}`),
    ),
  )
}

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
