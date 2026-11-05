import { VOCAB } from '../vocab.ts'
import {
  didYouMean,
  emitGroups,
  GroupError,
  reachable,
  resolve,
  type Def,
  type GroupSource,
  type GroupUse,
  type Rule,
} from '../css.ts'
import type { Matrix, MatrixDiagnostic, MatrixGroup } from '../matrix.ts'

const table = VOCAB as unknown as Record<string, Record<string, Record<string, string>>>
const isChannel = (p: string) => p.startsWith('--_')

/** Every intent object in a definition, with where it sits (`base`, `status=late`, `part title`…). */
function places(def: Def): [string, Record<string, unknown>][] {
  const out: [string, Record<string, unknown>][] = [['base', def.base ?? {}]]
  for (const [axis, vals] of Object.entries(def.axes ?? {}))
    if (vals !== 'inherit') for (const [v, i] of Object.entries(vals)) out.push([`${axis}=${v}`, i])
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

function groupShape(
  g: GroupSource,
  def: Def,
  valid: GroupUse[],
  ok: boolean,
  shapes: Map<string, Set<string>>,
) {
  const rules = ok ? safeReachable(g, valid) : []
  const allRules = ok
    ? safeReachable(g, [
        { group: g.name, axes: {}, states: [], part: null, dynamic: true },
        ...Object.keys(def.parts ?? {}).map((part) => ({
          group: g.name,
          axes: {},
          states: [],
          part,
          dynamic: false,
        })),
      ])
    : []
  shapes.set(
    g.name,
    new Set(
      allRules.flatMap((r) =>
        Object.entries(r.decls)
          .filter(([p]) => !isChannel(p))
          .map(([p, v]) => `${r.part ?? ''}|${r.tier > 0 ? '?' : ''}|${p}:${v}`),
      ),
    ),
  )
  const setsTone = allRules.some((r) => Object.keys(r.decls).some(isChannel))
  const readsTone = allRules.some((r) =>
    Object.values(r.decls).some((v) => /var\(--_[\w-]+\)/.test(v)),
  )

  return { rules, contextTone: !setsTone && readsTone }
}

type Report = (
  code: string,
  severity: MatrixDiagnostic['severity'],
  message: string,
  help: string,
  at?: { file?: string; line?: number },
) => number

function resolveDefinition(g: GroupSource, def: Def, where: string, report: Report) {
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
      report(
        'D025',
        'error',
        e.message,
        'Use a token from the vocabulary (`weft style explain` lists them), or `css: { … }` for a raw value (D023).',
      )
      continue
    }
    for (const [k, v] of Object.entries(intent)) {
      if (k === 'css') {
        const props = Object.keys(v as object)
        escapes.push({ at, props })
        report(
          'D023',
          'warning',
          `group ${g.name} ${at} uses the \`css\` escape for ${props.join(', ')}`,
          nearestToken(v as Record<string, unknown>),
        )
      } else tokens.add(`${k}.${v as string}`)
    }
  }

  return { resolved, tokens, escapes, ok }
}

function validateAccents(g: GroupSource, mine: GroupUse[], tokens: Set<string>, report: Report) {
  // Sites whose accent names an unknown intent or token are D025, and left out of the CSS and the checks below.
  const accents: MatrixGroup['accents'] = []
  const valid: GroupUse[] = []
  for (const u of mine) {
    let good = true
    if (u.accent && Object.keys(u.accent).length) {
      accents.push({ file: u.file ?? g.file, line: u.line ?? 0, set: u.accent })
      for (const [k, v] of Object.entries(u.accent)) {
        if (k === 'css' || !table[k]?.[v]) {
          const help = !table[k]
            ? `${didYouMean(k, Object.keys(table))}Intents: ${Object.keys(table).join(', ')}.`
            : `${didYouMean(v, Object.keys(table[k]))}${k} is one of ${Object.keys(table[k]).join(', ')}.`
          report(
            'D025',
            'error',
            `accent \`${k}: ${JSON.stringify(v)}\` on ${g.name} isn't ${table[k] ? 'a token' : 'an intent'}`,
            help,
            u,
          )
          good = false
        } else tokens.add(`${k}.${v}`)
      }
    }
    if (good) valid.push(u)
  }

  return { accents, valid }
}

function reportRepeatedAccents(g: GroupSource, accents: MatrixGroup['accents'], report: Report) {
  // D022: the same accent at 3+ sites.
  const byAccent = new Map<string, typeof accents>()
  for (const a of accents) {
    const key = Object.entries(a.set)
      .sort((x, y) => (String(x) < String(y) ? -1 : 1))
      .map(([k, v]) => `${k}: '${v}'`)
      .join(', ')
    byAccent.set(key, [...(byAccent.get(key) ?? []), a])
  }
  for (const [key, sites] of byAccent)
    if (sites.length >= 3)
      report(
        'D022',
        'info',
        `the accent { ${key} } on ${g.name} appears ${sites.length} times (${sites.map((s) => `${s.file}:${s.line}`).join(', ')})`,
        `Promote it to an axis value of ${g.name}, e.g. axes: { variant: { …: { ${key} } } }, and pass the value at those sites.`,
        sites[0],
      )
}

function reportCompounds(
  g: GroupSource,
  def: Def,
  resolved: Record<string, Record<string, string>>,
  report: Report,
) {
  // D024 (b): two compounds on one element that can match at once, setting one property differently.
  const compounds = def.compounds ?? []
  for (let i = 0; i < compounds.length; i++)
    for (let j = i + 1; j < compounds.length; j++) {
      const [a, b] = [compounds[i]!, compounds[j]!]
      if ((a.part ?? null) !== (b.part ?? null)) continue
      if (Object.entries(a.when).some(([axis, v]) => axis in b.when && b.when[axis] !== v)) continue
      const [da, db] = [resolved[`compound ${i}`] ?? {}, resolved[`compound ${j}`] ?? {}]
      const clash = Object.keys(da).filter((p) => p in db && da[p] !== db[p])
      if (clash.length)
        report(
          'D024',
          'error',
          `compounds ${i} and ${j} of ${g.name} can both match (${JSON.stringify({ ...a.when, ...b.when })}) and set ${clash.join(', ')} differently; compound ${j} wins only by order`,
          `Make their \`when\`s exclusive, or add a compound for the combination that says which value wins.`,
        )
    }
}

function reportAccentClashes(
  g: GroupSource,
  def: Def,
  valid: GroupUse[],
  resolved: Record<string, Record<string, string>>,
  report: Report,
) {
  // D024 (c): an accent that sets a property the site's own axis values set.
  for (const u of valid) {
    if (!u.accent) continue
    const accentProps = new Set(Object.keys(resolveSafe(u.accent)))
    for (const [axis, vals] of Object.entries(def.axes ?? {})) {
      if (vals === 'inherit' || !(axis in u.axes)) continue
      for (const v of u.axes[axis] ?? Object.keys(vals)) {
        const clash = Object.keys(resolved[`${axis}=${v}`] ?? {}).filter((p) => accentProps.has(p))
        // A tone is six channels: name the intent, not each channel.
        const named = [...new Set(clash.map((p) => (isChannel(p) ? 'the tone' : p)))]
        if (clash.length)
          report(
            'D024',
            'error',
            `the accent ${JSON.stringify(u.accent)} on ${g.name} sets ${named.join(', ')}, which its ${axis}=${v} also sets`,
            `Drop the accent, or make it a value of the ${axis} axis.`,
            u,
          )
      }
    }
  }
}

function buildGroup(
  g: GroupSource,
  uses: GroupUse[],
  diagnostics: MatrixDiagnostic[],
  out: Record<string, MatrixGroup>,
  shapes: Map<string, Set<string>>,
) {
  const mine = uses.filter((u) => u.group === g.name)
  const def = g.def ?? {}
  const where = `${g.file}:${g.line}`
  const report = (
    code: string,
    severity: MatrixDiagnostic['severity'],
    message: string,
    help: string,
    at?: { file?: string; line?: number },
  ) =>
    diagnostics.push({
      code,
      severity,
      group: g.name,
      file: at?.file ?? g.file,
      line: at?.line ?? g.line,
      message,
      help,
    })

  const { resolved, tokens, escapes, ok } = resolveDefinition(g, def, where, report)
  const { accents, valid } = validateAccents(g, mine, tokens, report)

  reportRepeatedAccents(g, accents, report)

  if (ok) {
    reportCompounds(g, def, resolved, report)
    reportAccentClashes(g, def, valid, resolved, report)
  }

  const { rules, contextTone } = groupShape(g, def, valid, ok, shapes)
  out[g.name] = {
    doc: g.doc ?? null,
    file: where,
    binding: g.binding ?? null,
    exported: g.exported ?? false,
    axes: Object.fromEntries(
      Object.entries(def.axes ?? {}).map(([a, v]) => [
        a,
        v === 'inherit' ? 'inherit' : Object.keys(v),
      ]),
    ),
    defaults: def.defaults ?? {},
    parts: Object.keys(def.parts ?? {}),
    states: Object.keys(def.states ?? {}),
    compounds: (def.compounds ?? []).map((c) => ({ when: c.when, part: c.part ?? null })),
    resolved,
    tokens: [...tokens].sort(),
    escapes,
    contextTone,
    used: mine.map((u) => ({
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

function similarGroups(
  shapes: Map<string, Set<string>>,
  out: Record<string, MatrixGroup>,
  diagnostics: MatrixDiagnostic[],
) {
  // D021: groups whose CSS is ≥ 90% the same.
  const similar: Matrix['similar'] = []
  const names = [...shapes.keys()]
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [shapes.get(names[i]!)!, shapes.get(names[j]!)!]
      if (a.size < 3 || b.size < 3) continue
      const s = Math.round(jaccard(a, b) * 100) / 100
      if (s < 0.9) continue
      similar.push([names[i]!, names[j]!, s])
      const [ga, gb] = [out[names[i]!]!, out[names[j]!]!]
      const [file, line] = gb.file.split(/:(?=\d+$)/)
      diagnostics.push({
        code: 'D021',
        severity: 'warning',
        group: names[j]!,
        file: file!,
        line: Number(line),
        message: `groups ${names[i]} (${ga.file}) and ${names[j]} resolve to ${Math.round(s * 100)}% the same CSS`,
        help: `Merge them into one group, with an axis for what differs (\`weft style explain ${names[i]}\` and \`${names[j]}\` side by side).`,
      })
    }
  return similar
}

/** Build the matrix from the project's definitions and call sites (files relative to the project root). */
export function buildMatrix(groups: GroupSource[], uses: GroupUse[]): Matrix {
  const diagnostics: MatrixDiagnostic[] = []
  const out: Record<string, MatrixGroup> = {}
  const shapes = new Map<string, Set<string>>()
  for (const g of [...groups].sort((a, b) => a.name.localeCompare(b.name)))
    buildGroup(g, uses, diagnostics, out, shapes)

  const similar = similarGroups(shapes, out, diagnostics)

  diagnostics.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code),
  )
  return {
    version: 1,
    groups: out,
    vocab: Object.fromEntries(Object.entries(table).map(([k, v]) => [k, Object.keys(v)])),
    similar,
    diagnostics,
  }
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
    const p = prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    const hits: string[] = []
    for (const [intent, values] of Object.entries(table))
      for (const [token, decls] of Object.entries(values))
        if (p in decls && Object.keys(decls).length <= 3)
          hits.push(`${intent}: '${token}' (${decls[p]})`)
    const exact = hits.find((h) => h.endsWith(`(${String(value)})`))
    if (exact) hints.push(`${p}: ${exact.replace(/ \(.*/, '')} is the same value`)
    else if (hits.length) hints.push(`${p}: ${hits.slice(0, 4).join(', ')}`)
  }
  return hints.length
    ? `Use a token: ${hints.join('; ')}.`
    : 'No intent sets these properties; keep the escape, or propose an intent for the vocabulary.'
}
