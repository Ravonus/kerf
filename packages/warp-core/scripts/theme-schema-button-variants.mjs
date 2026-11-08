// Review the Button variant rules without promoting their incomplete paint cascade.
import { consumers } from './theme-schema-consumers.mjs'
import { componentsPath } from './theme-schema-components.mjs'
import { buttonProperty, localDependencies } from './theme-schema-button-properties.mjs'

const host = ':where([data-scope="button"]'
const variant = (name, suffix = '') => `${host}[data-emphasis="${name}"]${suffix})`
const rules = [
  { variant: 'solid', selector: `${host}:not([data-emphasis]))` },
  { variant: 'solid', selector: `${host}:not([data-emphasis]))`,
    after: '@supports (color: oklch(from red l c h))',
    atRules: ['@supports (color: oklch(from red l c h))'] },
  { variant: 'solid', selector: `${host}[data-tone="neutral"]:not([data-emphasis]))` },
  { variant: 'solid', selector: `${host}:not([data-emphasis], [data-tone]))` },
  ...['soft', 'outline', 'ghost', 'frame', 'link'].map((name) => ({
    variant: name, selector: variant(name),
    ...(name === 'ghost' ? { after: `${variant('soft')} {` } : {}),
  })),
  { variant: 'all', selector: `${host})::before` },
  { variant: 'all', selector: `${host})::after` },
  { variant: 'all', selector: `${host}:hover)::before,\n${host}:focus-visible)::before,\n${host}[data-hold])::before,\n${host}[data-state="open"])::before,\n${host}[aria-expanded="true"])::before`,
    states: ['hover', 'focus', 'open'] },
  { variant: 'all', selector: `${host}:is(:disabled)),\n${host}:is([aria-disabled="true"]))`,
    states: ['disabled'] },
  { variant: 'all', selector: `${host}:disabled),\n${host}[aria-disabled="true"]:not([data-loading]))`,
    states: ['disabled'] },
  { variant: 'all', selector: `${host}:is(:active)),\n${host}:is([data-press]))`,
    states: ['press'] },
  { variant: 'emphasis', selector: `${host}[data-emphasis]:active)::before`, states: ['press'] },
  { variant: 'solid', selector: `${host}:not([data-emphasis]):active)::before`, states: ['press'] },
  { variant: 'all', selector: `${host}:active)::before`, states: ['press'],
    after: '@media (hover: none)', atRules: ['@media (hover: none)'] },
  { variant: 'all', selector: `${host}:disabled)::before, ${host}[aria-disabled="true"])::before`,
    states: ['disabled'] },
  { variant: 'outline', selector: variant('outline', ':hover'), states: ['hover'] },
  { variant: 'link', selector: variant('link', ':hover'), states: ['hover'] },
  { variant: 'link', selector: variant('link', ':active'), states: ['press'] },
  { variant: 'frame', selector: `${host}[data-emphasis="frame"][data-tone]:not([data-tone="accent"]))` },
  { variant: 'frame', selector: `${host}[data-emphasis="frame"][data-tone="neutral"])` },
  { variant: 'frame', selector: `${variant('frame', ':hover')},\n${variant('frame', ':focus-visible')}`,
    states: ['hover', 'focus'] },
  { variant: 'ghost,outline', selector: `${host}[data-emphasis="ghost"][data-tone="neutral"]),\n${host}[data-emphasis="outline"][data-tone="neutral"])` },
  { variant: 'soft,outline,ghost', selector: `${host}:is([data-emphasis="soft"])),\n${host}:is([data-emphasis="outline"])),\n${host}:is([data-emphasis="ghost"]))` },
]

export function classifyButtonVariants(text, defaults) {
  const result = []
  for (const rule of rules) {
    const from = rule.after ? text.indexOf(rule.after) : 0
    const start = text.indexOf(`${rule.selector} {`, from)
    if (from < 0 || start < 0) throw new Error(`button: missing ${rule.selector}`)
    const end = text.indexOf('}', start)
    const original = text.slice(start, end + 1)
    const parsed = consumers(componentsPath, original)
    const clean = original.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    const bodyStart = clean.indexOf('{') + 1
    const body = clean.slice(bodyStart, -1)
    const declarations = [...body.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)]
    if (!declarations.length) throw new Error(`button: empty ${rule.selector}`)
    for (const item of declarations) {
      const property = item[1]
      const cleanFallback = item[2].trim()
      const offset = start + bodyStart + item.index + item[0].indexOf(cleanFallback)
      const fallback = text.slice(offset, offset + cleanFallback.length)
      const read = parsed.find((entry) => entry.property === property)
      const lexical = [...new Set([...cleanFallback.matchAll(/var\(\s*(--[\w-]+)/g)]
        .map((match) => match[1]))].sort()
      if (lexical.join(',') !== (read?.reads ?? []).join(',')) {
        throw new Error(`button: unparsed input in ${rule.selector}: ${property}`)
      }
      const channel = property.startsWith('--_')
      const mechanical = ['content', 'position', 'pointer-events', 'cursor'].includes(property)
      const decision = channel ? { classification: 'variant channel dependency',
        reason: 'This assignment feeds Button paint; its complete cascade remains under review.' } :
        mechanical ? { classification: 'mechanical exclusion',
          reason: 'Structural or interaction behavior is not a writable theme token.' } :
          buttonProperty(property, rule.selector)
      result.push({ part: 'button', variant: rule.variant, states: rule.states ?? ['rest'],
        selector: rule.selector, atRules: ['@layer warp.components', ...(rule.atRules ?? [])],
        source: componentsPath, property, fallback, fallbackSpan: [offset, offset + fallback.length],
        inputs: (read?.reads ?? []).map((token) => ({ token, classification:
          token.startsWith('--_') ? 'local channel' : 'system input' })),
        ...decision })

    }
  }
  const definitions = [...defaults, ...result].filter((row) => row.property.startsWith('--_'))
  return result.map((row) => ({ ...row, localDependencies: localDependencies(row.inputs, definitions) }))
}
