import { readFileSync } from 'node:fs'

const template = readFileSync(new URL('../../tailwind.template.css', import.meta.url), 'utf8')
const aliases = {
  radius: { card: 'surface', pill: 'round' },
  font: { body: 'sans' },
  shadow: { none: '0', sm: '1', md: '2', lg: '3' },
}
const prefixes = { space: 'spacing', radius: 'radius', font: 'font', shadow: 'shadow' }
const sources = { space: 'space', radius: 'radius', font: 'font', shadow: 'elevation' }

/** Generate a Tailwind entry for all names used by the base and named themes. */
export function tailwindTheme({ colors = {}, system = {}, themes = {} } = {}) {
  const entries = new Map()
  for (const match of template.matchAll(/  (--[a-z0-9-]+): ([^;]+);/g))
    entries.set(match[1], match[2])
  const configs = [{ colors, system }, ...Object.values(themes)]
  for (const config of configs) {
    for (const name of Object.keys(config.colors ?? {}).sort())
      entries.set(`--color-${name}`, `var(--warp-named-${name})`)
    for (const [kind, prefix] of Object.entries(prefixes)) {
      for (const name of Object.keys(config.system?.[kind] ?? {}).sort()) {
        const canonical = aliases[kind]?.[name] ?? name
        entries.set(`--${prefix}-${name}`, `var(--warp-${sources[kind]}-${canonical})`)
      }
    }
    for (const name of Object.keys(config.system?.text ?? {}).sort()) {
      entries.set(`--text-${name}`, `var(--warp-text-${name}-size)`)
      entries.set(`--text-${name}--line-height`, `var(--warp-text-${name}-leading)`)
    }
  }
  const lines = [...entries]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n')
  return `@theme inline {\n${lines}\n}\n`
}
