// Classify the reviewed type and spacing shims; source changes require renewed review.
import { createHash } from 'node:crypto'
import { consumers } from './theme-schema-consumers.mjs'

const hashes = {
  'packages/warp/src/type.css': '2982fb7d4051d8b5f75171aa2336685aae32a57fdc1e96f44ab073db287b56a0',
  'packages/warp/src/layout.css': 'b09414e18f5111be94dd1f2e1175c02c9c0ff9496870ce900041396b19170a16',
}
const fields = {
  'font-family': ['family', 'family', 'forbidden'],
  'font-size': ['size', 'font-size', 'px'],
  'line-height': ['lineHeight', 'leading', 'unitless'],
  'font-weight': ['weight', 'weight', 'unitless'],
  'letter-spacing': ['letterSpacing', 'tracking', 'px'],
  'text-transform': ['transform', 'transform-case', 'forbidden'],
}

export function classifyShim(source, text) {
  const hash = createHash('sha256').update(text).digest('hex')
  if (hash !== hashes[source]) throw new Error(`${source}: unreviewed source change`)
  const parsed = consumers(source, text)
  const result = []
  const rules = /(:where\([^{}]+\))\s*\{([^{}]*)\}/g
  for (const rule of text.matchAll(rules)) {
    const selector = rule[1]
    const role = /data-role="([\w-]+)"/.exec(selector)?.[1]
    const items = /([\w-]+)\s*:\s*([^;]+);/g
    for (const item of rule[2].matchAll(items)) {
      const property = item[1]
      const fallback = item[2].trim()
      const start = rule.index + rule[0].indexOf(rule[2]) + item.index + item[0].indexOf(fallback)
      const base = { selector, atRules: ['@layer warp.layout'], source, property, fallback,
        fallbackSpan: [start, start + fallback.length] }
      const input = /var\((--[\w-]+)\)/.exec(fallback)?.[1]
      if (role && fields[property] && input === `--warp-text-${role}-${({family:'font',size:'size',lineHeight:'leading',weight:'weight',letterSpacing:'tracking',transform:'case'})[fields[property][0]]}`) {
        const [field, domain, units] = fields[property]
        result.push({ ...base, part: `text/${role}`, state: 'rest', path: `font.${field}`,
          token: `--warp-text--${role}-font-${field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
          domain, units, systemPath: `text.${role}.${field}`,
          inputs: [{ token: input, classification: 'system input' }], classification: 'binding' })
      } else if (source.endsWith('/layout.css') && selector === ':where([data-gap="page"])' && property === '--_gap') {
        result.push({ ...base, systemPath: 'space.page', domain: 'space', units: 'px',
          inputs: [{ token: input, classification: 'system input' }], classification: 'system binding',
          reason: 'Space intent sets the shared local gap channel, not a component part.',
          downstream: { token: '--_gap', source: 'docs/design/warp/tokens/warp-layout.css',
            classification: 'unresolved canonical consumers' } })
      } else if (property === 'color' && selector.includes('[data-ink=')) {
        result.push({ ...base, inputs: [{ token: input, classification: 'system input' }],
          classification: 'system-driven', reason: 'Ink variant uses an existing semantic colour.' })
      } else if (property === 'color' && input === '--_text') {
        result.push({ ...base, inputs: [{ token: input, classification: 'local channel',
          source: 'docs/design/warp/tokens/warp-components.css',
          reason: 'Tone channels supply this value; their transitive ownership remains unresolved.' }],
          classification: 'external channel', reason: 'Tone variants use the shared local text channel.',
          transitiveInputs: ['accent', 'neutral', 'positive', 'caution', 'critical', 'info'].map((tone) => ({
            token: `--warp-color-${tone}-text`, classification: 'unresolved canonical input',
            source: 'docs/design/warp/tokens/warp-components.css',
          })) })
      } else if (property === 'margin' && fallback === '0') {
        result.push({ ...base, inputs: [], classification: 'excluded', reason: 'Structural reset without a token input.' })
      } else throw new Error(`${source}: unclassified declaration ${property}`)
    }
  }
  if (parsed.length !== result.filter((row) => row.inputs.length).length) {
    throw new Error(`${source}: parsed declaration coverage mismatch`)
  }
  return result
}
