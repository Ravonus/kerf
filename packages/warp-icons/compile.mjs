// The build's view of icons: walk an app's sources, follow every name to the literals it can be, and ship only those.
// Names go through variables, conditionals, static lists and maps, imports and props handed down through components.
// A name it can't follow is legal: that use gets the pack, lazily. An unknown literal is an error. No Rust: the pass is
// a parse and a walk, so it runs the same in `vite build` and `weft check`.
import { closest } from './src/compile-closest.mjs'
import { title, pascal } from './src/compile-pascal.mjs'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { actionList, list, findings as catalogFindings } from './src/compile-catalog.mjs'
import { namesModule } from './src/compile-names.mjs'
import { rewritePack } from './src/compile-rewrite-pack.mjs'
import { resolver } from './src/compile-resolver.mjs'
import { read } from './src/compile-read.mjs'
import { unwrap, literal } from './src/compile-unwrap.mjs'
export { closest } from './src/compile-closest.mjs'
export { pascal } from './src/compile-pascal.mjs'
export { actionList, list, packCost, publish } from './src/compile-catalog.mjs'
export { namesModule, trimTiers } from './src/compile-names.mjs'

/** warp's expression stops, in order. */
export const STOPS = ['quiet', 'balanced', 'vivid']
/** The stop a page has unless it says otherwise. */
export const DEFAULT_STOP = 'balanced'
const SKIP = new Set(['node_modules', 'dist', '.weft', '.git', 'target', 'coverage'])
const CODE = /\.[cm]?[jt]sx?$/
const ICON_SOURCES = new Set([
  '@weft-js/warp-icons/all',
  '@weft-js/warp-icons/icon',
  '@weft-js/warp',
])

/** The variant flags `<Icon>` takes. */
export const VARIANTS = ['solid']
/** Which variants an element asks for: '' is hollow, the default. A flag it can't read may be either. */
function variants(element) {
  const out = new Set(),
    flags = element.attributes.filter(
      (a) =>
        a.type === 'JSXAttribute' && (VARIANTS.includes(a.name.name) || a.name.name === 'action'),
    )
  for (const a of flags) {
    const v = a.value?.type === 'JSXExpressionContainer' ? unwrap(a.value.expression) : null
    if (
      !a.value ||
      v?.value === true ||
      typeof a.value.value === 'string' ||
      (typeof v?.value === 'string' && v.value)
    )
      return { set: new Set([a.name.name]), fixed: flags.length === 1 }
    if (v?.value === false) continue
    out.add(a.name.name)
    out.add('')
  }
  if (!out.size) out.add('')
  return { set: out, fixed: out.size === 1 }
}

const line = (code, at) => {
  const before = code.slice(0, at).split('\n')
  return { line: before.length, column: before.at(-1).length + 1 }
}

function sources(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) {
        if (entry !== 'test' && entry !== 'tests' && entry !== '__tests__') walk(p)
      } else if (CODE.test(entry) && !/\.(test|spec|d)\./.test(entry) && !/\.config\./.test(entry))
        out.push(p)
      else if (extname(entry) === '.html') out.push(p)
    }
  }
  walk(root)
  return out
}

const isSpecifier = (unit, id) =>
  unit.ast.body.some(
    (n) =>
      n.type === 'ImportDeclaration' &&
      n.specifiers?.some((s) => s.local === id || s.local.start === id.start),
  )
const packLocals = (unit) =>
  [...unit.imports]
    .filter(
      ([, i]) =>
        i.source === '@weft-js/warp-icons' && (i.imported === 'default' || i.imported === '*'),
    )
    .map(([l]) => l)
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '')
const TOOLS = new Set(['iconSet'])
/** `X`, `XHollow`, `XIcon`, `XIconSolid`: a pack member as a name and a variant. */
function member(id) {
  const [, base, variant = ''] = /^(.+?)(Hollow|Solid|Action)?$/.exec(
    id.replace(/Icon(?=$|Hollow$|Solid$|Action$)/, ''),
  )
  return { name: kebab(base), variant: variant === 'Hollow' ? '' : variant.toLowerCase() }
}
function packName(id, catalog, names, missing) {
  if (TOOLS.has(id)) return
  const { name, variant } = member(id)
  if (catalog.includes(name)) names.add(variant ? `${name}:${variant}` : name)
  else missing()
}
const packIds = (catalog) => catalog.map((n) => title(n))

function readUnits(root) {
  const units = new Map()
  const queue = sources(root)
  while (queue.length) {
    const file = queue.pop()
    if (units.has(file)) continue
    let code
    try {
      code = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const unit = read(file, code)
    units.set(file, unit)
    queue.push(...unit.related)
  }
  return units
}

/** Everything a build needs to know: the names, the stops, and where either escaped. */
export function analyze(root, { catalog }) {
  const units = readUnits(root)
  const usesOf = new Map()
  for (const u of units.values())
    for (const use of u.uses) {
      const key = `${use.comp}.${use.prop}`
      if (!usesOf.has(key)) usesOf.set(key, [])
      usesOf.get(key).push({ unit: u, use })
    }

  const { expression } = resolver(units, usesOf)

  const names = new Set(),
    unknown = [],
    dynamic = [],
    escaped = [],
    stops = new Set([DEFAULT_STOP]),
    stopsDynamic = []
  const known = new Set(catalog)
  const where = (unit, at) => ({
    file: relative(root, unit.file),
    abs: unit.file,
    ...line(unit.code, at),
  })
  const site = createSite({ expression, known, names, unknown, dynamic, where, catalog })
  const iconLocal = (unit, comp) => {
    const imp = unit.imports.get(comp)
    return imp && imp.imported === 'Icon' && ICON_SOURCES.has(imp.source)
  }
  const warpLocal = (unit, comp) => {
    const imp = unit.imports.get(comp.split('.')[0])
    return imp && (imp.source === '@weft-js/warp' || imp.source.startsWith('@weft-js/warp/'))
  }
  const ctx = {
    catalog,
    names,
    unknown,
    dynamic,
    escaped,
    stops,
    stopsDynamic,
    known,
    where,
    site,
    expression,
    iconLocal,
    warpLocal,
  }
  for (const unit of units.values()) scanUnit(unit, ctx)
  return {
    names,
    unknown,
    dynamic,
    escaped,
    stops: stopsDynamic.length ? new Set(STOPS) : stops,
    stopsDynamic,
    files: units.size,
  }
}

function createSite({ expression, known, names, unknown, dynamic, where, catalog }) {
  return (unit, expr, at, soft, element) => {
    const r = expression(unit, expr)
    const kinds = element ? variants(element).set : new Set([''])
    for (const v of r.values) {
      if (known.has(v))
        for (const k of kinds) {
          if (k === 'action' && !actionList().includes(v))
            unknown.push({
              name: v,
              why: actionMessage(v).slice(5),
              ...where(unit, unwrap(expr).start ?? at),
            })
          else names.add(k ? `${v}:${k}` : v)
        }
      else if (!soft)
        unknown.push({
          name: v,
          suggest: closest(v, catalog),
          ...where(unit, unwrap(expr).start ?? at),
        })
    }
    if (r.dynamic) dynamic.push({ why: r.dynamic, ...where(unit, at) })
  }
}

function scanUnit(unit, ctx) {
  const { stops, stopsDynamic, known, where, site, expression, iconLocal, warpLocal } = ctx
  for (const use of unit.uses) {
    if (use.prop === 'name' && iconLocal(unit, use.comp))
      site(unit, use.expr, use.at, false, use.element)
    else if (use.prop === 'icon' && warpLocal(unit, use.comp)) {
      // a literal becomes the icon itself (`rewrite`), so it needs no entry in every page's table
      const v = literal(use.expr)
      if (v !== undefined && known.has(v)) continue
      site(unit, use.expr, use.at, false)
    }
    if (use.prop === 'tier') {
      for (const v of expression(unit, use.expr).values) if (STOPS.includes(v)) stops.add(v)
    }
  }
  if (unit.warp) for (const s of unit.sites) site(unit, s.expr, s.at, true)
  scanPack(unit, ctx)
  for (const s of unit.stops) {
    if (s.value) {
      if (STOPS.includes(s.value)) stops.add(s.value)
      continue
    }
    if (s.dynamic) {
      stopsDynamic.push(where(unit, s.at))
      continue
    }
    const r = expression(unit, s.expr)
    for (const v of r.values) if (STOPS.includes(v)) stops.add(v)
    if (r.dynamic) stopsDynamic.push({ why: r.dynamic, ...where(unit, s.at) })
  }
}

function scanPack(unit, ctx) {
  const { catalog, names, unknown, dynamic, escaped, where, expression } = ctx
  for (const local of packLocals(unit)) {
    const own = unit.members.filter((m) => m.local === local),
      inner = new Set(own.map((m) => m.node.object))
    for (const { node } of own) {
      if (node.computed) {
        const r = expression(unit, node.property)
        for (const v of r.values)
          packName(v, catalog, names, () =>
            unknown.push({
              name: v,
              suggest: closest(v, packIds(catalog)),
              ...where(unit, node.start),
            }),
          )
        if (r.dynamic) dynamic.push({ why: r.dynamic, ...where(unit, node.start) })
      } else
        packName(node.property.name, catalog, names, () =>
          unknown.push({
            name: node.property.name,
            suggest: closest(node.property.name, packIds(catalog)),
            ...where(unit, node.property.start),
          }),
        )
    }
    for (const id of unit.idents)
      if (id.name === local && !inner.has(id) && !isSpecifier(unit, id))
        escaped.push({ why: `${local} is used as a value`, ...where(unit, id.start) })
  }
}

/** `<Icon name="check">` becomes `<CheckIcon>`, the same output a named import gives, and `icon="check"` on a warp component takes `CheckIcon`. */
export function rewrite(code, file, catalog) {
  if (!/@weft-js\/(warp-icons|warp)/.test(code)) return null
  const unit = read(file, code)
  if (!unit.ast) return null
  const local = [...unit.imports].find(
    ([, i]) => i.imported === 'Icon' && ICON_SOURCES.has(i.source),
  )?.[0]
  const edits = [],
    added = new Set()
  // `Icon` alone is a small file over the names module, so this import doesn't bring the set
  for (const n of unit.ast.body)
    if (
      n.type === 'ImportDeclaration' &&
      n.source.value === '@weft-js/warp-icons/all' &&
      n.specifiers.length === 1 &&
      n.specifiers[0].imported?.name === 'Icon'
    )
      edits.push({ start: n.source.start, end: n.source.end, text: "'@weft-js/warp-icons/icon'" })
  // the pack: a default import is the namespace, so a static member is an ordinary named import to the bundler
  const lookups = rewritePack({
    unit,
    catalog,
    code,
    file,
    edits,
    packLocals,
    packName,
    unknownMessage,
    packIds,
    line,
  })
  for (const use of unit.uses) {
    if (use.prop === 'icon') {
      const v = literal(use.expr),
        imp = unit.imports.get(use.comp.split('.')[0])
      if (
        v === undefined ||
        !imp ||
        !(imp.source === '@weft-js/warp' || imp.source.startsWith('@weft-js/warp/'))
      )
        continue
      if (catalog && !catalog.includes(v))
        throw Object.assign(new Error(unknownMessage(v, catalog)), {
          loc: { file, ...line(code, unwrap(use.expr).start) },
        })
      const name = pascal(v)
      added.add(name)
      edits.push({ start: use.at, end: use.end, text: `icon={${name}}` })
      continue
    }
    if (!local || use.comp !== local || use.prop !== 'name') continue
    const v = unwrap(use.expr)
    if ((v.type !== 'Literal' && v.type !== 'StringLiteral') || typeof v.value !== 'string')
      continue
    if (catalog && !catalog.includes(v.value))
      throw Object.assign(new Error(unknownMessage(v.value, catalog)), {
        loc: { file, ...line(code, v.start) },
      })
    if (!use.element.selfClosing) continue
    const wanted = variants(use.element)
    if (!wanted.fixed) continue
    if (wanted.set.has('action') && !actionList().includes(v.value))
      throw Object.assign(new Error(actionMessage(v.value)), {
        loc: { file, ...line(code, v.start) },
      })
    const name = pascal(v.value, [...wanted.set][0])
    added.add(name)
    edits.push(
      { start: use.element.start, end: use.element.name.end, text: `<${name}` },
      { start: use.at, end: use.end, text: '' },
    )
    for (const a of use.element.attributes)
      if (a.type === 'JSXAttribute' && VARIANTS.includes(a.name.name))
        edits.push({ start: a.start, end: a.end, text: '' })
  }
  if (!edits.length) return null
  let out = code
  for (const e of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  const head =
    (added.size ? `import { ${[...added].join(', ')} } from '@weft-js/warp-icons'\n` : '') +
    (lookups ? "import { pack as __icon } from '@weft-js/warp-icons/names'\n" : '')
  return head + out
}

/** I001 for `action` on an icon that has none. */
export const actionMessage = (name) =>
  `I001 no action for icon '${name}', did you mean '${closest(name, actionList())}'? The action icons are ${actionList().join(', ')}.`
/** I001 for a name that isn't in the catalog. */
export const unknownMessage = (name, catalog) =>
  `I001 no icon '${name}', did you mean '${closest(name, catalog)}'?`

/** The vite side, loaded by @weft-js/core/vite when @weft-js/warp-icons is in the build. */
export function pass({ root, command, tier, source }) {
  const build = command === 'build'
  const catalog = list()
  const result = build ? analyze(root, { catalog }) : null
  const lazy = !!result?.dynamic.length
  const stops =
    tier && tier !== 'all' ? new Set([tier]) : result && !tier ? result.stops : new Set(STOPS)
  return { catalog, result, lazy, stops, module: () => namesModule(result.names, { lazy, source }) }
}

/** The icon findings for a build. */
export function findings(root) {
  return catalogFindings(root, analyze)
}
