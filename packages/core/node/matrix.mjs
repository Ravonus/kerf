import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'
// The style matrix (research 23 §2.4): `.kerf/styles.json`, every group with its axes, values, parts, states,
// accents, resolved declarations and where each is used, plus the style D-codes that need the whole project (D021–D025,
// research 23 §3). The Vite plugin writes it from what it compiled; `kerf style` and `kerf check` build it by scanning
// the project with the same compiler (`scanProject`). Generated, never hand-edited. Plain data and erasable types: the
// plugin and the CLI import it in Node, as node/matrix.mjs (scripts/node-style.mjs).
import {
  accentWords,
  didYouMean,
  emitGroups,
  GroupError,
  resolveTraced,



} from './css.mjs'

export { buildMatrix } from './matrix/build.mjs'





















































/** One element of an explained group: its declarations in cascade order, each with where it came from. */



















function validateSelection(g             , selection           ) {
  const def = g.def ?? {}
  const axisDefs = Object.entries(def.axes ?? {}).filter(
    (e)                                                         => e[1] !== 'inherit',
  )
  const axes                         = { ...def.defaults }
  for (const [a, v] of Object.entries(selection.axes ?? {})) {
    const vals = def.axes?.[a]
    if (!vals || vals === 'inherit')
      throw new GroupError(
        `group ${g.name} has no axis \`${a}\` (${didYouMean(
          a,
          axisDefs.map(([x]) => x),
        )}axes: ${axisDefs.map(([x]) => x).join(', ') || 'none'})`,
      )
    if (!(v in vals))
      throw new GroupError(
        `\`${v}\` isn't a value of ${g.name}'s \`${a}\` axis (${didYouMean(v, Object.keys(vals))}values: ${Object.keys(vals).join(', ')})`,
      )
    axes[a] = v
  }
  const states = selection.states ?? []
  for (const s of states)
    if (!(s in (def.states ?? {})))
      throw new GroupError(
        `group ${g.name} has no state \`${s}\` (${didYouMean(s, Object.keys(def.states ?? {}))}states: ${Object.keys(def.states ?? {}).join(', ') || 'none'})`,
      )
  const parts = selection.part ? [selection.part] : Object.keys(def.parts ?? {})
  for (const p of parts)
    if (!(p in (def.parts ?? {})))
      throw new GroupError(
        `group ${g.name} has no part \`${p}\` (${didYouMean(p, Object.keys(def.parts ?? {}))}parts: ${Object.keys(def.parts ?? {}).join(', ') || 'none'})`,
      )
  const accent = selection.accent ?? {}
  return { def, axes, states, parts, accent }
}

/**
 * The resolved CSS for one selection of a group, and where each value came from (token, axis, state, compound or
 * accent), as `kerf explain` does for compiled code. Unknown axes, values, states or parts throw a GroupError (D025).
 */
export function explainGroup(
  g             ,
  selection




    = {},
)            {
  const { def, axes, states, parts, accent } = validateSelection(g, selection)

  const where = (at        ) => `group ${g.name} (${g.file}:${g.line}) ${at}`

  const layers          = [{ at: 'base', intent: def.base ?? {} }]
  for (const p of parts) layers.push({ at: `part ${p}`, part: p, intent: def.parts [p]  })
  for (const [a, v] of Object.entries(axes)) {
    const vals = def.axes?.[a]
    if (vals && vals !== 'inherit' && vals[v]) layers.push({ at: `${a}=${v}`, intent: vals[v] })
  }
  for (const s of states) layers.push({ at: `state ${s}`, intent: def.states [s]  })
  for (const [n, c] of (def.compounds ?? []).entries())
    if (
      Object.entries(c.when).every(([a, v]) => axes[a] === v) &&
      (!c.part || parts.includes(c.part))
    )
      layers.push({ at: `compound ${n}`, part: c.part, intent: c.set })
  for (const [word, intent] of accentWords([
    { group: g.name, axes: {}, states: [], part: null, dynamic: false, accent },
  ]))
    layers.push({ at: `accent ${word}`, intent })

  const elements                        = []
  for (const element of [undefined, ...parts]) {
    const decls                                         = []
    for (const l of layers.filter((x) => x.part === element)) {
      for (const [prop, d] of Object.entries(resolveTraced(l.intent, where(l.at)))) {
        for (const prev of decls) if (prev.prop === prop && !prev.overridden) prev.overridden = true
        decls.push({ prop, value: d.value, from: d.from, at: l.at })
      }
    }
    elements.push({ element: element ? `part ${element}` : 'root', decls })
  }
  const use           = {
    group: g.name,
    axes: Object.fromEntries(Object.entries(axes).map(([a, v]) => [a, [v]])),
    states,
    part: null,
    dynamic: false,
    accent,
  }
  const css = emitGroups(
    [g],
    [use, ...parts.map((part) => ({ group: g.name, axes: {}, states: [], part, dynamic: false }))],
    { dev: true },
  )
  return { group: g.name, selection: { axes, states, accent }, elements, css }
}

// --- Project scan (the CLI's view; the Vite plugin keeps its own registry as it compiles) ---


















const IMPORTS = /import\s+\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/g
const EXT = /\.[cm]?[jt]sx?$/

/** A relative import → the file on disk (`./card` → `card.tsx`), as a bundler would find it. */
export function resolveImport(from        , spec        )                     {
  const base = resolvePath(dirname(from), spec)
  for (const f of [
    base,
    ...['.tsx', '.ts', '.jsx', '.js'].map((e) => base + e),
    ...['.tsx', '.ts'].map((e) => join(base, `index${e}`)),
  ])
    if (EXT.test(f) && existsSync(f)) return f
  return undefined
}

/**
 * `options.groups` for one file: the exported groups of the modules it imports by relative path, keyed as the
 * compiler expects (`<absolute path without extension>#<export>`).
 */
export function importedGroups(
  file        ,
  code        ,
  defsOf                                 ,
) {
  const out                                             = {}
  for (const [, names, spec] of code.matchAll(IMPORTS)) {
    const target = resolveImport(file, spec )
    if (!target) continue
    const found = defsOf(target).filter((g) => g.exported)
    if (!found.length) continue
    const key = resolvePath(dirname(file), spec ).replace(EXT, '')
    for (const n of names .split(',')) {
      const imported = n
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
      const g = found.find((x) => x.binding === imported)
      if (g) out[`${key}#${imported}`] = { name: g.name, def: g.def }
    }
  }
  return out
}

/**
 * Scan source files (relative to `root`) for group definitions, then compile each `.tsx`/`.jsx` with the groups it
 * imports to collect call sites. Returns files relative to `root`, and the compiler's style diagnostics per file.
 */
export function scanProject(root        , files          , transform           ) {
  const defs = new Map                       ()
  root = resolvePath(root)
  const defsOf = (file        ) => {
    const abs = resolvePath(file)
    if (!defs.has(abs)) {
      const code = existsSync(abs) ? readFileSync(abs, 'utf8') : ''
      defs.set(
        abs,
        code.includes('@kerf/core/style')
          ? (transform(code, { filename: abs, checkOnly: true }).facts.groups ?? []).map((g) => ({
              ...g,
              file: relative(root, abs).split('\\').join('/'),
            }))
          : [],
      )
    }
    return defs.get(abs)
  }
  const abs = files.map((f) => resolvePath(root, f))
  for (const f of abs) defsOf(f)
  const uses             = []
  const diagnostics







      = []
  for (const f of abs.filter((x) => /\.[jt]sx$/.test(x))) {
    const code = readFileSync(f, 'utf8')
    if (!code.includes('{...')) continue
    const groups = importedGroups(f, code, defsOf)
    if (!Object.keys(groups).length && !defsOf(f).length) continue
    const out = transform(code, { filename: f, checkOnly: true, groups })
    const rel = relative(root, f).split('\\').join('/')
    for (const u of out.facts.groupUses ?? []) uses.push({ ...u, file: rel })
    for (const d of out.diagnostics)
      if (/^D02\d$/.test(d.code)) diagnostics.push({ file: rel, ...d })
  }
  return { groups: [...defs.values()].flat(), uses, diagnostics }
}
