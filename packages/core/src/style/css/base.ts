// Group CSS at build (research 23 §2.5 steps 2–4, §6): resolve intents through the token table, then emit rules only
// for the axis values, states, parts and compounds that some call site can produce. Output goes in `@layer
// app.groups`, one `@scope ([data-g="x"]) to ([data-g])` per group, so its rules never reach into a nested group,
// with parts as `[data-part]` under it. A group's own tone is folded into direct token reads (`foldTones`).
// Options keep the variants the spike measured: `:where()` selectors, parts tagged with `data-g` (and then flat
// selectors), blocks shared across groups. `emitAtomic` writes the same styles as one class per declaration, for the
// spike's comparison only.
import { VOCAB } from '../vocab.ts'

export type GroupSource = {
  name: string
  def: Def
  file: string
  line: number
  binding?: string
  exported?: boolean
  doc?: string | null
}
export type GroupUse = {
  group: string
  axes: Record<string, string[] | null>
  states: string[]
  part: string | null
  dynamic: boolean
  /** The site's accent, intent → token; it renders as `data-accent="radius:round"`. */
  accent?: Record<string, string> | null
  file?: string
  line?: number
}

export type Intent = Record<string, unknown>
export type Def = {
  base?: Intent
  axes?: Record<string, Record<string, Intent> | 'inherit'>
  parts?: Record<string, Intent>
  states?: Record<string, Intent>
  compounds?: { when: Record<string, string>; part?: string; set: Intent }[]
  defaults?: Record<string, string>
}
export type Decls = Record<string, string>

/** Where a rule applies: the root or a part, under some axis values, a state or an accent word (`radius:round`). */
export type Rule = {
  part?: string | undefined
  axes: [string, string][]
  state?: string
  accent?: string
  tier: number
  decls: Decls
  at: string
}

export class GroupError extends Error {}

export const ARIA = new Set([
  'selected',
  'pressed',
  'checked',
  'expanded',
  'current',
  'invalid',
  'busy',
])
export const PSEUDO: Record<string, string> = {
  hover: ':hover',
  focus: ':focus-visible',
  active: ':active',
  disabled: ':disabled',
}
const kebab = (k: string) =>
  k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const table = VOCAB as unknown as Record<string, Record<string, Decls>>

/** `Did you mean `x`? ` for names within a third of the word's length (or containing it), else ''. */
export function didYouMean(word: string, names: string[]): string {
  const dist = (a: string, b: string) => {
    // edit distance with adjacent swaps as one edit (`titel` → `title`)
    const d = Array.from({ length: a.length + 1 }, (_row, i) =>
      Array.from({ length: b.length + 1 }, (_cell, j) => (i ? (j ? 0 : i) : j)),
    )
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) {
        d[i]![j] = Math.min(
          d[i - 1]![j]! + 1,
          d[i]![j - 1]! + 1,
          d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        )
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1)
      }
    return d[a.length]![b.length]!
  }
  const w = word.toLowerCase()
  const limit = Math.max(1, Math.floor(w.length / 3))
  const close = names
    .map((n) => [dist(w, n.toLowerCase()), n] as const)
    .filter(([d, n]) => d <= limit || n.toLowerCase().includes(w) || w.includes(n.toLowerCase()))
    .sort((a, b) => a[0] - b[0])
    .slice(0, 3)
    .map(([, n]) => `\`${n}\``)
  return close.length ? `Did you mean ${close.join(' or ')}? ` : ''
}

/** An intent object → declarations, each with the intent and token it came from (`pad: group`, or `css`). */
export function resolveTraced(
  intent: Intent,
  where: string,
): Record<string, { value: string; from: string }> {
  const out: Record<string, { value: string; from: string }> = {}
  for (const [key, value] of Object.entries(intent ?? {})) {
    if (key === 'css') {
      for (const [p, v] of Object.entries(value as Record<string, unknown>))
        out[kebab(p)] = { value: String(v), from: 'css' }
      continue
    }
    const values = table[key]
    if (!values)
      throw new GroupError(
        `${where}: \`${key}\` isn't an intent (${didYouMean(key, Object.keys(table))}one of ${Object.keys(table).join(', ')}; raw CSS goes in \`css: { … }\`)`,
      )
    const decls = values[String(value)]
    if (!decls)
      throw new GroupError(
        `${where}: \`${key}: ${JSON.stringify(value)}\` isn't a token (${didYouMean(String(value), Object.keys(values))}${key} is one of ${Object.keys(values).join(', ')})`,
      )
    for (const [p, v] of Object.entries(decls))
      out[p] = { value: v, from: `${key}: ${value as string}` }
  }
  return out
}

/** An intent object → declarations, later keys winning. Throws a GroupError naming the bad key or value. */
export function resolve(intent: Intent, where: string): Decls {
  return Object.fromEntries(
    Object.entries(resolveTraced(intent, where)).map(([p, d]) => [p, d.value]),
  )
}

/** Every accent word (`radius:round`) the given root sites write, each with its one-intent object. */
export function accentWords(uses: GroupUse[]): [string, Intent][] {
  const words = new Map<string, Intent>()
  for (const u of uses)
    for (const [k, v] of Object.entries(u.accent ?? {})) words.set(`${k}:${v}`, { [k]: v })
  return [...words]
}

/** The rules of one group that its call sites can reach, in cascade order (tier, then definition order). */
export function reachable(g: GroupSource, uses: GroupUse[]): Rule[] {
  const { def, name } = g
  const roots = uses.filter((u) => !u.part)
  const any = roots.some((u) => u.dynamic)
  const axes = Object.entries(def.axes ?? {}).filter(
    (e): e is [string, Record<string, Intent>] => e[1] !== 'inherit',
  )
  const values = new Map<string, Set<string>>()
  for (const [axis, vals] of axes) {
    const set = new Set<string>()
    for (const u of roots) {
      const v = any ? null : u.axes[axis]
      if (v === undefined) continue
      for (const x of v ?? Object.keys(vals)) set.add(x)
    }
    values.set(axis, set)
  }
  const states = new Set([
    ...roots.flatMap((u) => (any ? Object.keys(def.states ?? {}) : u.states)),
    ...Object.keys(PSEUDO),
  ])
  const parts = new Set(uses.flatMap((u) => (u.part ? [u.part] : [])))
  const at = (what: string) => `group ${name} (${g.file}:${g.line}) ${what}`
  const rules: Rule[] = []
  if (roots.length)
    rules.push({ axes: [], tier: 0, decls: resolve(def.base ?? {}, at('base')), at: 'base' })
  for (const [part, intent] of Object.entries(def.parts ?? {}))
    if (parts.has(part))
      rules.push({
        part,
        axes: [],
        tier: 0,
        decls: resolve(intent, at(`part ${part}`)),
        at: `part ${part}`,
      })
  for (const [axis, vals] of axes)
    for (const [value, intent] of Object.entries(vals))
      if (values.get(axis)!.has(value))
        rules.push({
          axes: [[axis, value]],
          tier: 1,
          decls: resolve(intent, at(`${axis}=${value}`)),
          at: `${axis}=${value}`,
        })
  if (roots.length)
    for (const [state, intent] of Object.entries(def.states ?? {}))
      if (states.has(state))
        rules.push({
          axes: [],
          state,
          tier: 2,
          decls: resolve(intent, at(`state ${state}`)),
          at: `state ${state}`,
        })
  for (const [i, c] of (def.compounds ?? []).entries()) {
    const when = Object.entries(c.when)
    if (when.every(([a, v]) => values.get(a)?.has(v)) && (!c.part || parts.has(c.part)))
      rules.push({
        part: c.part,
        axes: when,
        tier: 3,
        decls: resolve(c.set, at(`compound ${i}`)),
        at: `compound ${i}`,
      })
  }
  // Accents last: a one-off at a call site wins over the group's own values (research 23 §2.2).
  for (const [word, intent] of accentWords(any ? [] : roots))
    rules.push({
      axes: [],
      accent: word,
      tier: 4,
      decls: resolve(intent, at(`accent ${word}`)),
      at: `accent ${word}`,
    })
  return rules.filter((r) => Object.keys(r.decls).length)
}
