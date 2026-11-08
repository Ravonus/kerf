// Record attached and joined sweep geometry without assigning it to the Button host.
import { consumers } from './theme-schema-consumers.mjs'
import { componentsPath } from './theme-schema-components.mjs'
import { foundationsPath } from './theme-schema-button-radius.mjs'

function region(text, from, to) {
  const start = text.indexOf(from)
  const end = text.indexOf(to, start + from.length)
  if (start < 0 || end < 0) throw new Error(`button radius: missing region ${from}`)
  return [start, end]
}

function collect(source, text, bounds, layer, properties, owner, expected) {
  const [start, end] = bounds
  const section = text.slice(start, end)
  const rules = [...section.matchAll(/(:where\([^{}]*?)\s*\{([^{}]*)\}/g)]
  if (rules.length !== expected) throw new Error(`button radius: ${owner} rule count ${rules.length}`)
  const rows = []
  for (const rule of rules) {
    const selector = rule[1].trim()
    const body = rule[2]
    const parsed = consumers(source, `${selector} {${body}}`)
    for (const match of body.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)) {
      const property = match[1]
      if (!properties.includes(property)) continue
      const fallback = match[2].trim()
      const offset = start + rule.index + rule[0].indexOf(body) + match.index + match[0].indexOf(fallback)
      const inputs = [...new Set([...fallback.matchAll(/var\(\s*(--[\w-]+)/g)]
        .map((item) => item[1]))].sort()
      const read = parsed.find((item) => item.property === property)
      if (inputs.join(',') !== (read?.reads ?? []).join(',')) {
        throw new Error(`button radius: ${owner} unparsed ${property}`)
      }
      rows.push({ part: 'button', path: 'radius', owner, selector, atRules: [layer], source,
        property, fallback, fallbackSpan: [offset, offset + fallback.length],
        inputs: inputs.map((token) => ({ token, classification: 'radius geometry input' })),
        classification: 'radius geometry dependency',
        reason: 'Preserve the original selector, corner masking and ownership in the local cascade.' })
    }
  }
  return rows
}

export function buttonRadiusJoins(components, foundations) {
  const corner = ['border-start-start-radius', 'border-end-start-radius',
    'border-start-end-radius', 'border-end-end-radius']
  const sweep = [...corner, '--_js', '--_je', '--_round']
  const host = collect(componentsPath, components, region(components,
    ':where([data-scope="button-group"][data-attached] > [data-scope="button"]:not(:first-child))',
    ':where([data-scope="button-group"][data-attached] > [data-scope="button"]:focus-visible)'),
    '@layer warp.components', corner, 'attached Button host', 2)
  const attached = collect(componentsPath, components, region(components,
    ':where([data-scope="button-group"][data-attached]:not(:is([data-orientation="vertical"]',
    '/* -- Toggle button / toggle group'), '@layer warp.components', sweep, 'attached sweep child', 5)
  const inherited = collect(foundationsPath, foundations, region(foundations,
    '/* two stacked 1px borders', ':where([data-part="sweep"]:empty)'),
    '@layer warp.signature', ['border-radius'], 'sweep child inherited radius', 1)
  const rounding = collect(foundationsPath, foundations, region(foundations,
    "/* the clip's corners, physical", '/* joined (SIGNATURE §1.8)'),
    '@layer warp.signature', ['--_rs', '--_re', '--_round'], 'sweep child LTR and RTL', 2)
  const joined = collect(foundationsPath, foundations, region(foundations,
    '/* joined (SIGNATURE §1.8)', '/* the base wipes away'),
    '@layer warp.signature', sweep, 'joined sweep child', 5)
  const clips = collect(foundationsPath, foundations, region(foundations,
    '/* the base wipes away', '/* error: pinned'), '@layer warp.signature',
    ['clip-path'], 'sweep child clip', 2)
  return [...host, ...attached, ...inherited, ...rounding, ...joined, ...clips]
}
