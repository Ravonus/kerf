// The style matrix (research 23 §2.4): `.weft/styles.json`, every group with its axes, values, parts, states,
// accents, resolved declarations and where each is used, plus the style D-codes that need the whole project (D021–D025,
// research 23 §3). The Vite plugin writes it from what it compiled; `weft style` and `weft check` build it by scanning
// the project with the same compiler (`scanProject`). Generated, never hand-edited. Plain data and erasable types: the
// plugin and the CLI import it in Node, as node/matrix.mjs (scripts/node-style.mjs).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'
import { VOCAB } from './vocab.ts'
import { accentWords, didYouMean, emitGroups, GroupError, reachable, resolve, resolveTraced, type Def, type GroupSource, type GroupUse, type Rule } from './css.ts'

export type MatrixDiagnostic = { code: string; severity: 'error' | 'warning' | 'info'; group: string; file: string; line: number; message: string; help: string }

export type MatrixGroup = {
  doc: string | null
  /** `src/order-card.tsx:4` */
  file: string
  binding: string | null
  exported: boolean
  axes: Record<string, string[] | 'inherit'>
  defaults: Record<string, string>
  parts: string[]
  states: string[]
  compounds: { when: Record<string, string>; part: string | null }[]
  /** Declarations per place, before tone folding: `base`, `status=late`, `part title`, `state selected`, `compound 0`, `accent radius:round`. */
  resolved: Record<string, Record<string, string>>
  /** `intent.token` names the group and its accents use (`pad.group`, `tone.critical`). */
  tokens: string[]
  /** `css: { … }` escapes (D023): where, and the properties they set. */
  escapes: { at: string; props: string[] }[]
  /** Reads a tone it doesn't set, so it takes one from warp's `data-tone` context. */
  contextTone: boolean
  used: { file: string; line: number; axes: Record<string, string[] | 'dynamic'>; states: string[]; part?: string; dynamic?: true }[]
  accents: { file: string; line: number; set: Record<string, string> }[]
  /** Bytes of the group's CSS for the sites it has (minified, before compression). */
  bytes: number
}

export type Matrix = {
  version: 1
  groups: Record<string, MatrixGroup>
  /** The closed vocabulary: intent → its token names. */
  vocab: Record<string, string[]>
  /** Groups whose resolved CSS is ≥ 90% the same (D021): [a, b, similarity]. */
  similar: [string, string, number][]
  diagnostics: MatrixDiagnostic[]
}

const table = VOCAB as unknown as Record<string, Record<string, Record<string, string>>>
const isChannel = (p: string) => p.startsWith('--_')

/** Every intent object in a definition, with where it sits (`base`, `status=late`, `part title`…). */
function places(def: Def): [string, Record<string, unknown>][] {
  const out: [string, Record<string, unknown>][] = [['base', def.base ?? {}]]
  for (const [axis, vals] of Object.entries(def.axes ?? {})) if (vals !== 'inherit') for (const [v, i] of Object.entries(vals)) out.push([`${axis}=${v}`, i])
  for (const [k, i] of Object.entries(def.parts ?? {})) out.push([`part ${k}`, i])
  for (const [k, i] of Object.entries(def.states ?? {})) out.push([`state ${k}`, i])
  for (const [n, c] of (def.compounds ?? []).entries()) out.push([`compound ${n}`, c.set])
  return out
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  let n = 0
  for (const x of a) if (b.has(x)) n++
  return n / (a.size + b.size - n || 1)
}

/** Build the matrix from the project's definitions and call sites (files relative to the project root). */
export function buildMatrix(groups: GroupSource[], uses: GroupUse[]): Matrix {
  const diagnostics: MatrixDiagnostic[] = []
  const out: Record<string, MatrixGroup> = {}
  const shapes = new Map<string, Set<string>>()
  for (const g of [...groups].sort((a, b) => a.name.localeCompare(b.name))) {
    const mine = uses.filter(u => u.group === g.name)
    const def = g.def ?? {}
    const where = `${g.file}:${g.line}`
    const report = (code: string, severity: MatrixDiagnostic['severity'], message: string, help: string, at?: { file?: string; line?: number }) =>
      diagnostics.push({ code, severity, group: g.name, file: at?.file ?? g.file, line: at?.line ?? g.line, message, help })

    const resolved: Record<string, Record<string, string>> = {}
    const tokens = new Set<string>()
    const escapes: MatrixGroup['escapes'] = []
    let ok = true
    for (const [at, intent] of places(def)) {
      try {
        resolved[at] = resolve(intent, `group ${g.name} (${where}) ${at}`)
      } catch (e) {
        if (!(e instanceof GroupError)) throw e
        ok = false
        report('D025', 'error', e.message, 'Use a token from the vocabulary (`weft style explain` lists them), or `css: { … }` for a raw value (D023).')
        continue
      }
      for (const [k, v] of Object.entries(intent)) {
        if (k === 'css') {
          const props = Object.keys(v as object)
          escapes.push({ at, props })
          report('D023', 'warning', `group ${g.name} ${at} uses the \`css\` escape for ${props.join(', ')}`, nearestToken(v as Record<string, unknown>))
        } else tokens.add(`${k}.${v}`)
      }
    }

    // Sites whose accent names an unknown intent or token are D025, and left out of the CSS and the checks below.
    const accents: MatrixGroup['accents'] = []
    const valid: GroupUse[] = []
    for (const u of mine) {
      let good = true
      if (u.accent && Object.keys(u.accent).length) {
        accents.push({ file: u.file ?? g.file, line: u.line ?? 0, set: u.accent })
        for (const [k, v] of Object.entries(u.accent)) {
          if (k === 'css' || !table[k]?.[v]) {
            const help = !table[k] ? `${didYouMean(k, Object.keys(table))}Intents: ${Object.keys(table).join(', ')}.` : `${didYouMean(v, Object.keys(table[k]))}${k} is one of ${Object.keys(table[k]).join(', ')}.`
            report('D025', 'error', `accent \`${k}: ${JSON.stringify(v)}\` on ${g.name} isn't ${table[k] ? 'a token' : 'an intent'}`, help, u)
            good = false
          } else tokens.add(`${k}.${v}`)
        }
      }
      if (good) valid.push(u)
    }

    // D022: the same accent at 3+ sites.
    const byAccent = new Map<string, typeof accents>()
    for (const a of accents) {
      const key = Object.entries(a.set).sort().map(([k, v]) => `${k}: '${v}'`).join(', ')
      byAccent.set(key, [...(byAccent.get(key) ?? []), a])
    }
    for (const [key, sites] of byAccent)
      if (sites.length >= 3)
        report('D022', 'info', `the accent { ${key} } on ${g.name} appears ${sites.length} times (${sites.map(s => `${s.file}:${s.line}`).join(', ')})`, `Promote it to an axis value of ${g.name}, e.g. axes: { variant: { …: { ${key} } } }, and pass the value at those sites.`, sites[0])

    if (ok) {
      // D024 (b): two compounds on one element that can match at once, setting one property differently.
      const compounds = def.compounds ?? []
      for (let i = 0; i < compounds.length; i++)
        for (let j = i + 1; j < compounds.length; j++) {
          const [a, b] = [compounds[i], compounds[j]]
          if ((a.part ?? null) !== (b.part ?? null)) continue
          if (Object.entries(a.when).some(([axis, v]) => axis in b.when && b.when[axis] !== v)) continue
          const [da, db] = [resolved[`compound ${i}`] ?? {}, resolved[`compound ${j}`] ?? {}]
          const clash = Object.keys(da).filter(p => p in db && da[p] !== db[p])
          if (clash.length)
            report('D024', 'error', `compounds ${i} and ${j} of ${g.name} can both match (${JSON.stringify({ ...a.when, ...b.when })}) and set ${clash.join(', ')} differently; compound ${j} wins only by order`, `Make their \`when\`s exclusive, or add a compound for the combination that says which value wins.`)
        }
      // D024 (c): an accent that sets a property the site's own axis values set.
      for (const u of valid) {
        if (!u.accent) continue
        const accentProps = new Set(Object.keys(resolveSafe(u.accent)))
        for (const [axis, vals] of Object.entries(def.axes ?? {})) {
          if (vals === 'inherit' || !(axis in u.axes)) continue
          for (const v of u.axes[axis] ?? Object.keys(vals)) {
            const clash = Object.keys(resolved[`${axis}=${v}`] ?? {}).filter(p => accentProps.has(p))
            // A tone is six channels: name the intent, not each channel.
            const named = [...new Set(clash.map(p => (isChannel(p) ? 'the tone' : p)))]
            if (clash.length)
              report('D024', 'error', `the accent ${JSON.stringify(u.accent)} on ${g.name} sets ${named.join(', ')}, which its ${axis}=${v} also sets`, `Drop the accent, or make it a value of the ${axis} axis.`, u)
          }
        }
      }
    }

    const rules = ok ? safeReachable(g, valid) : []
    const allRules = ok ? safeReachable(g, [{ group: g.name, axes: {}, states: [], part: null, dynamic: true }, ...Object.keys(def.parts ?? {}).map(part => ({ group: g.name, axes: {}, states: [], part, dynamic: false }))]) : []
    shapes.set(g.name, new Set(allRules.flatMap(r => Object.entries(r.decls).filter(([p]) => !isChannel(p)).map(([p, v]) => `${r.part ?? ''}|${r.tier > 0 ? '?' : ''}|${p}:${v}`))))
    const setsTone = allRules.some(r => Object.keys(r.decls).some(isChannel))
    const readsTone = allRules.some(r => Object.values(r.decls).some(v => /var\(--_[\w-]+\)/.test(v)))

    out[g.name] = {
      doc: g.doc ?? null,
      file: where,
      binding: g.binding ?? null,
      exported: g.exported ?? false,
      axes: Object.fromEntries(Object.entries(def.axes ?? {}).map(([a, v]) => [a, v === 'inherit' ? 'inherit' : Object.keys(v)])),
      defaults: def.defaults ?? {},
      parts: Object.keys(def.parts ?? {}),
      states: Object.keys(def.states ?? {}),
      compounds: (def.compounds ?? []).map(c => ({ when: c.when, part: c.part ?? null })),
      resolved,
      tokens: [...tokens].sort(),
      escapes,
      contextTone: !setsTone && readsTone,
      used: mine.map(u => ({
        file: u.file ?? g.file,
        line: u.line ?? 0,
        axes: Object.fromEntries(Object.entries(u.axes).map(([a, v]) => [a, v ?? 'dynamic'])),
        states: u.states,
        ...(u.part ? { part: u.part } : {}),
        ...(u.dynamic ? { dynamic: true as const } : {}),
      })),
      accents,
      bytes: rules.length ? Buffer.byteLength(emitGroups([g], valid)) : 0,
    }
  }

  // D021: groups whose CSS is ≥ 90% the same.
  const similar: Matrix['similar'] = []
  const names = [...shapes.keys()]
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [shapes.get(names[i])!, shapes.get(names[j])!]
      if (a.size < 3 || b.size < 3) continue
      const s = Math.round(jaccard(a, b) * 100) / 100
      if (s < 0.9) continue
      similar.push([names[i], names[j], s])
      const [ga, gb] = [out[names[i]], out[names[j]]]
      const [file, line] = gb.file.split(/:(?=\d+$)/)
      diagnostics.push({
        code: 'D021', severity: 'warning', group: names[j], file, line: Number(line),
        message: `groups ${names[i]} (${ga.file}) and ${names[j]} resolve to ${Math.round(s * 100)}% the same CSS`,
        help: `Merge them into one group, with an axis for what differs (\`weft style explain ${names[i]}\` and \`${names[j]}\` side by side).`,
      })
    }

  diagnostics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code))
  return { version: 1, groups: out, vocab: Object.fromEntries(Object.entries(table).map(([k, v]) => [k, Object.keys(v)])), similar, diagnostics }
}

function resolveSafe(intent: Record<string, unknown>) {
  try {
    return resolve(intent, '')
  } catch {
    return {}
  }
}

function safeReachable(g: GroupSource, uses: GroupUse[]): Rule[] {
  try {
    return reachable(g, uses)
  } catch (e) {
    if (e instanceof GroupError) return []
    throw e
  }
}

/** D023's fix: for each raw declaration, the vocabulary tokens that set that property, if any. */
function nearestToken(css: Record<string, unknown>): string {
  const hints: string[] = []
  for (const [prop, value] of Object.entries(css)) {
    const p = prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
    const hits: string[] = []
    for (const [intent, values] of Object.entries(table))
      for (const [token, decls] of Object.entries(values)) if (p in decls && Object.keys(decls).length <= 3) hits.push(`${intent}: '${token}' (${decls[p]})`)
    const exact = hits.find(h => h.endsWith(`(${String(value)})`))
    if (exact) hints.push(`${p}: ${exact.replace(/ \(.*/, '')} is the same value`)
    else if (hits.length) hints.push(`${p}: ${hits.slice(0, 4).join(', ')}`)
  }
  return hints.length ? `Use a token: ${hints.join('; ')}.` : 'No intent sets these properties; keep the escape, or propose an intent for the vocabulary.'
}

/** One element of an explained group: its declarations in cascade order, each with where it came from. */
export type Explained = {
  group: string
  /** The axis values and states the explanation is for (defaults filled in). */
  selection: { axes: Record<string, string>; states: string[]; accent: Record<string, string> }
  elements: { element: string; decls: { prop: string; value: string; from: string; at: string; overridden?: true }[] }[]
  /** The CSS this selection emits (dev form, tones folded). */
  css: string
}

/**
 * The resolved CSS for one selection of a group, and where each value came from (token, axis, state, compound or
 * accent), as `weft explain` does for compiled code. Unknown axes, values, states or parts throw a GroupError (D025).
 */
export function explainGroup(g: GroupSource, selection: { axes?: Record<string, string>; states?: string[]; accent?: Record<string, string>; part?: string } = {}): Explained {
  const def = g.def ?? {}
  const axisDefs = Object.entries(def.axes ?? {}).filter((e): e is [string, Record<string, Record<string, unknown>>] => e[1] !== 'inherit')
  const axes: Record<string, string> = { ...(def.defaults ?? {}) }
  for (const [a, v] of Object.entries(selection.axes ?? {})) {
    const vals = def.axes?.[a]
    if (!vals || vals === 'inherit') throw new GroupError(`group ${g.name} has no axis \`${a}\` (${didYouMean(a, axisDefs.map(([x]) => x))}axes: ${axisDefs.map(([x]) => x).join(', ') || 'none'})`)
    if (!(v in vals)) throw new GroupError(`\`${v}\` isn't a value of ${g.name}'s \`${a}\` axis (${didYouMean(v, Object.keys(vals))}values: ${Object.keys(vals).join(', ')})`)
    axes[a] = v
  }
  const states = selection.states ?? []
  for (const s of states) if (!(s in (def.states ?? {}))) throw new GroupError(`group ${g.name} has no state \`${s}\` (${didYouMean(s, Object.keys(def.states ?? {}))}states: ${Object.keys(def.states ?? {}).join(', ') || 'none'})`)
  const parts = selection.part ? [selection.part] : Object.keys(def.parts ?? {})
  for (const p of parts) if (!(p in (def.parts ?? {}))) throw new GroupError(`group ${g.name} has no part \`${p}\` (${didYouMean(p, Object.keys(def.parts ?? {}))}parts: ${Object.keys(def.parts ?? {}).join(', ') || 'none'})`)
  const accent = selection.accent ?? {}

  const where = (at: string) => `group ${g.name} (${g.file}:${g.line}) ${at}`
  type Layer = { at: string; part?: string; intent: Record<string, unknown> }
  const layers: Layer[] = [{ at: 'base', intent: def.base ?? {} }]
  for (const p of parts) layers.push({ at: `part ${p}`, part: p, intent: def.parts![p] })
  for (const [a, v] of Object.entries(axes)) {
    const vals = def.axes?.[a]
    if (vals && vals !== 'inherit' && vals[v]) layers.push({ at: `${a}=${v}`, intent: vals[v] })
  }
  for (const s of states) layers.push({ at: `state ${s}`, intent: def.states![s] })
  for (const [n, c] of (def.compounds ?? []).entries())
    if (Object.entries(c.when).every(([a, v]) => axes[a] === v) && (!c.part || parts.includes(c.part))) layers.push({ at: `compound ${n}`, part: c.part, intent: c.set })
  for (const [word, intent] of accentWords([{ group: g.name, axes: {}, states: [], part: null, dynamic: false, accent }])) layers.push({ at: `accent ${word}`, intent })

  const elements: Explained['elements'] = []
  for (const element of [undefined, ...parts]) {
    const decls: Explained['elements'][number]['decls'] = []
    for (const l of layers.filter(l => l.part === element)) {
      for (const [prop, d] of Object.entries(resolveTraced(l.intent, where(l.at)))) {
        for (const prev of decls) if (prev.prop === prop && !prev.overridden) prev.overridden = true
        decls.push({ prop, value: d.value, from: d.from, at: l.at })
      }
    }
    elements.push({ element: element ? `part ${element}` : 'root', decls })
  }
  const use: GroupUse = { group: g.name, axes: Object.fromEntries(Object.entries(axes).map(([a, v]) => [a, [v]])), states, part: null, dynamic: false, accent }
  const css = emitGroups([g], [use, ...parts.map(part => ({ group: g.name, axes: {}, states: [], part, dynamic: false }))], { dev: true })
  return { group: g.name, selection: { axes, states, accent }, elements, css }
}

// --- Project scan (the CLI's view; the Vite plugin keeps its own registry as it compiles) ---

type Transform = (code: string, options: object) => { diagnostics: { code: string; severity: string; message: string; help: string; start: number; end: number; line: number; column: number }[]; facts: { groups?: GroupSource[]; groupUses?: GroupUse[] } }

const IMPORTS = /import\s+\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/g
const EXT = /\.[cm]?[jt]sx?$/

/** A relative import → the file on disk (`./card` → `card.tsx`), as a bundler would find it. */
export function resolveImport(from: string, spec: string): string | undefined {
  const base = resolvePath(dirname(from), spec)
  for (const f of [base, ...['.tsx', '.ts', '.jsx', '.js'].map(e => base + e), ...['.tsx', '.ts'].map(e => join(base, `index${e}`))]) if (EXT.test(f) && existsSync(f)) return f
  return undefined
}

/**
 * `options.groups` for one file: the exported groups of the modules it imports by relative path, keyed as the
 * compiler expects (`<absolute path without extension>#<export>`).
 */
export function importedGroups(file: string, code: string, defsOf: (file: string) => GroupSource[]) {
  const out: Record<string, { name: string; def: Def }> = {}
  for (const [, names, spec] of code.matchAll(IMPORTS)) {
    const target = resolveImport(file, spec)
    if (!target) continue
    const found = defsOf(target).filter(g => g.exported)
    if (!found.length) continue
    const key = resolvePath(dirname(file), spec).replace(EXT, '')
    for (const n of names.split(',')) {
      const imported = n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]
      const g = found.find(g => g.binding === imported)
      if (g) out[`${key}#${imported}`] = { name: g.name, def: g.def }
    }
  }
  return out
}

/**
 * Scan source files (relative to `root`) for group definitions, then compile each `.tsx`/`.jsx` with the groups it
 * imports to collect call sites. Returns files relative to `root`, and the compiler's style diagnostics per file.
 */
export function scanProject(root: string, files: string[], transform: Transform) {
  const defs = new Map<string, GroupSource[]>()
  root = resolvePath(root)
  const defsOf = (file: string) => {
    const abs = resolvePath(file)
    if (!defs.has(abs)) {
      const code = existsSync(abs) ? readFileSync(abs, 'utf8') : ''
      defs.set(abs, code.includes('@weft-js/core/style') ? (transform(code, { filename: abs, checkOnly: true }).facts.groups ?? []).map(g => ({ ...g, file: relative(root, abs).split('\\').join('/') })) : [])
    }
    return defs.get(abs)!
  }
  const abs = files.map(f => resolvePath(root, f))
  for (const f of abs) defsOf(f)
  const uses: GroupUse[] = []
  const diagnostics: { file: string; code: string; severity: string; message: string; help: string; line: number; column: number }[] = []
  for (const f of abs.filter(f => /\.[jt]sx$/.test(f))) {
    const code = readFileSync(f, 'utf8')
    if (!code.includes('{...')) continue
    const groups = importedGroups(f, code, defsOf)
    if (!Object.keys(groups).length && !defsOf(f).length) continue
    const out = transform(code, { filename: f, checkOnly: true, groups })
    const rel = relative(root, f).split('\\').join('/')
    for (const u of out.facts.groupUses ?? []) uses.push({ ...u, file: rel })
    for (const d of out.diagnostics) if (/^D02\d$/.test(d.code)) diagnostics.push({ file: rel, ...d })
  }
  return { groups: [...defs.values()].flat(), uses, diagnostics }
}
