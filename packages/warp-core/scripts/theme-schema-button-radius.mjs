// Keep exact Button radius inputs visible while attached-sweep ownership is incomplete.
import { consumers } from './theme-schema-consumers.mjs'
import { componentsPath } from './theme-schema-components.mjs'

export const foundationsPath = 'docs/design/warp/tokens/warp.css'

function declaration(source, text, selector, property, layer, classification, reason) {
  const start = text.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`button radius: missing selector ${selector}`)
  const end = text.indexOf('}', start)
  const rule = text.slice(start, end + 1)
  const found = new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(rule)
  if (!found) throw new Error(`button radius: missing ${property} in ${selector}`)
  const fallback = found[1].trim()
  const offset = start + found.index + found[0].indexOf(fallback)
  const parsed = consumers(source, rule).find((item) => item.property === property)
  const lexical = [
    ...new Set([...fallback.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1])),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  if (lexical.join(',') !== (parsed?.reads ?? []).join(',')) {
    throw new Error(`button radius: unparsed input in ${property}`)
  }
  return {
    part: 'button',
    path: 'radius',
    selector,
    atRules: [layer],
    source,
    property,
    fallback,
    fallbackSpan: [offset, offset + fallback.length],
    inputs: lexical.map((token) => ({ token, classification: 'system input' })),
    classification,
    reason,
  }
}

export function buttonRadius(components, foundations) {
  const entries = []
  const add = (selector, property, layer, reason) =>
    entries.push(
      declaration(
        foundationsPath,
        foundations,
        selector,
        property,
        layer,
        'radius dependency',
        reason,
      ),
    )
  for (const selector of [
    ':root, [data-expression="balanced"]',
    '[data-expression="quiet"]',
    '[data-expression="vivid"]',
  ]) {
    add(selector, '--warp-x', '@layer warp.tokens', 'Expression sets the radius input.')
  }
  const scopes =
    ':root, [data-expression], [data-density], [data-form], [data-pointer],\n' +
    '[data-motion], [data-flair], [data-theme], [data-warp]'
  for (const property of ['--warp-radius-control', '--warp-radius-mark']) {
    add(
      scopes,
      property,
      '@layer warp.tokens',
      'The system radius derives from the local expression.',
    )
  }
  add(
    ':where([data-sweep])',
    '--warp-sweep-radius',
    '@layer warp.signature',
    'The sweep clip defaults to the control radius; attached-group adjustments remain unresolved.',
  )
  entries.push(
    declaration(
      componentsPath,
      components,
      ':where([data-scope="button"])',
      'border-radius',
      '@layer warp.components',
      'partial property binding',
      'The host uses the system control radius; group and sweep sites remain under review.',
    ),
  )
  return entries
}
