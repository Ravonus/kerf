import { pascal } from './compile-pascal.mjs'

/** The module veneer's name lookup becomes in a build: these names and no others, and the pack only if a name escaped. */
/** @param {Iterable<string>} names */
export function namesModule(names, { lazy = false, source } = {}) {
  const list = [...names].sort()
  const id = (key) => pascal(...key.split(':'))
  const imports = list.length
    ? `import { ${list.map(id).join(', ')} } from '@kerf-js/veneer-icons'\n`
    : ''
  const table = `const names = { ${list.map((n) => `${JSON.stringify(n)}: ${id(n)}`).join(', ')} }\nconst key = (name, variant) => (variant ? name + ':' + variant : name)\n`
  const packExport = `export const pack = id => { const [, b, v = ''] = /^(.+?)(Hollow|Solid|Action)?$/.exec(id.replace(/Icon(?=$|Hollow$|Solid$|Action$)/, '')); return resolve(b.replace(/[A-Z]/g, c => '-' + c.toLowerCase()).replace(/^-/, ''), v.toLowerCase()) }\n`
  if (source)
    return `${imports}import { remote } from '@kerf-js/veneer-icons/late'\n${table}const get = remote(${JSON.stringify(source)})\nexport const resolve = (name, variant) => names[key(name, variant)] ?? get(name, variant)\n${packExport}`
  if (lazy)
    return `${imports}import { late } from '@kerf-js/veneer-icons/late'\n${table}const load = () => import('@kerf-js/veneer-icons/all').then(m => m.lookup)\nexport const resolve = (name, variant) => names[key(name, variant)] ?? late(name, variant, load)\n${packExport}`
  return `${imports}${table}export const resolve = (name, variant) => names[key(name, variant)]\n${packExport}`
}

const VISIBLE = { quiet: 'oq', balanced: 'ob', vivid: 'v' }
/** Drop the drawings no shipped stop can show. With one stop left there is nothing to switch, so the switch goes too. */
export function trimTiers(source, stops) {
  // a build imports the pack as a namespace (rewrite), and this default would keep every icon alive
  const code = source
  if (stops.size === 3) return code
  const keep = [...stops].map((s) => VISIBLE[s]).join('')
  const out = code.replace(/<path data-t="([oqbv])"[^>]*?\/>/g, (m, t) =>
    keep.includes(t) ? m : '',
  )
  return stops.size === 1
    ? out.replaceAll(/ data-t="[oqbv]"/g, '').replace("import '../tiers.css'\n", '')
    : out
}
