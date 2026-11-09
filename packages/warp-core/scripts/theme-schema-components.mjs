// Review the complete status-light rule without claiming other component coverage.
import { consumers } from './theme-schema-consumers.mjs'

export const componentsPath = 'docs/design/warp/tokens/warp-components.css'
const selector = ':where([data-scope="status-light"])'

export function classifyComponents(text) {
  const start = text.indexOf(selector)
  if (start < 0 || text.indexOf('data-scope="status-light"', start + selector.length) !== -1) {
    throw new Error('status-light: source coverage mismatch')
  }
  const end = text.indexOf('}', start)
  const rule = text.slice(start, end + 1)
  const parsed = consumers(componentsPath, rule)
  if (
    parsed.length !== 1 ||
    parsed[0].property !== 'font-size' ||
    parsed[0].reads.join() !== '--warp-text-body-size'
  ) {
    throw new Error('status-light: token consumer mismatch')
  }
  const reasons = {
    display: 'Structural layout, not a token consumer.',
    'align-items': 'Structural alignment, not a token consumer.',
    gap: 'Literal value outside the recorded token consumer inventory.',
  }
  const declarations = [...rule.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)]
  if (declarations.length !== 4) throw new Error('status-light: declaration coverage mismatch')
  return declarations.map((match) => {
    const property = match[1]
    const fallback = match[2].trim()
    const valueStart = start + match.index + match[0].indexOf(fallback)
    const base = {
      part: 'status-light',
      state: 'rest',
      selector,
      atRules: ['@layer warp.components'],
      source: componentsPath,
      property,
      fallback,
      fallbackSpan: [valueStart, valueStart + fallback.length],
    }
    if (property === 'font-size' && fallback === 'var(--warp-text-body-size)') {
      return {
        ...base,
        path: 'font.size',
        token: '--warp-status-light-font-size',
        domain: 'font-size',
        units: 'px',
        classification: 'binding',
        inputs: [
          {
            token: '--warp-text-body-size',
            classification: 'system input',
            source: 'docs/design/warp/tokens/warp.css',
            reason: 'The system text role and its transitive inputs remain unresolved.',
          },
        ],
      }
    }
    if (!reasons[property]) throw new Error(`status-light: unclassified ${property}`)
    return { ...base, inputs: [], classification: 'excluded', reason: reasons[property] }
  })
}
