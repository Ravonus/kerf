// Group CSS at build (research 23 §2.5 steps 2–4): resolve intents through the token table, then emit rules only for
// the axis values, states, parts and compounds that some call site can produce. Output goes in `@layer app.groups`,
// every selector behind `:where()` (specificity 0), parts as `[data-part]`. With `scope` (the default) a group's rules
// sit in `@scope ([data-g="x"]:not([data-part])) to ([data-g]:not([data-part]))`, so they never reach into a
// nested group; `scope: false` writes the same rules flat. Identical declaration blocks are merged within a group
// (and, with `share`, bases and parts across groups). A tone sets warp's channel variables (`--_solid`, `--_text`, …) and fills read
// them; channels nobody reads are dropped. `emitAtomic` writes the same styles as one class per declaration, for the spike's comparison only.
import { VOCAB } from './vocab.ts'

export type GroupSource = { name: string; def: Def; file: string; line: number }
export type GroupUse = { group: string; axes: Record<string, string[] | null>; states: string[]; part: string | null; dynamic: boolean; file?: string; line?: number }

type Intent = Record<string, unknown>
type Def = {
  base?: Intent
  axes?: Record<string, Record<string, Intent> | 'inherit'>
  parts?: Record<string, Intent>
  states?: Record<string, Intent>
  compounds?: { when: Record<string, string>; part?: string; set: Intent }[]
  defaults?: Record<string, string>
}
type Decls = Record<string, string>

/** Where a rule applies: the root or a part, under some axis values and states. */
type Rule = { part?: string; axes: [string, string][]; state?: string; tier: number; decls: Decls }

export class GroupError extends Error {}

const ARIA = new Set(['selected', 'pressed', 'checked', 'expanded', 'current', 'invalid', 'busy'])
const PSEUDO: Record<string, string> = { hover: ':hover', focus: ':focus-visible', active: ':active', disabled: ':disabled' }
const kebab = (k: string) => (k.startsWith('--') ? k : k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`))
const table = VOCAB as unknown as Record<string, Record<string, Decls>>

/** An intent object → declarations, later keys winning. Throws a GroupError naming the bad key or value. */
export function resolve(intent: Intent, where: string): Decls {
  const out: Decls = {}
  for (const [key, value] of Object.entries(intent ?? {})) {
    if (key === 'css') {
      for (const [p, v] of Object.entries(value as Record<string, unknown>)) out[kebab(p)] = String(v)
      continue
    }
    const values = table[key]
    if (!values) throw new GroupError(`${where}: \`${key}\` isn't an intent (one of ${Object.keys(table).join(', ')}; raw CSS goes in \`css: { … }\`)`)
    const decls = values[String(value)]
    if (!decls) throw new GroupError(`${where}: \`${key}: ${JSON.stringify(value)}\` isn't a token (${key} is one of ${Object.keys(values).join(', ')})`)
    Object.assign(out, decls)
  }
  return out
}

/** The rules of one group that its call sites can reach, in cascade order (tier, then definition order). */
function reachable(g: GroupSource, uses: GroupUse[]): Rule[] {
  const { def, name } = g
  const roots = uses.filter(u => !u.part)
  const any = roots.some(u => u.dynamic)
  const axes = Object.entries(def.axes ?? {}).filter((e): e is [string, Record<string, Intent>] => e[1] !== 'inherit')
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
  const states = new Set([...roots.flatMap(u => (any ? Object.keys(def.states ?? {}) : u.states)), ...Object.keys(PSEUDO)])
  const parts = new Set(uses.flatMap(u => (u.part ? [u.part] : [])))
  const at = (what: string) => `group ${name} (${g.file}:${g.line}) ${what}`
  const rules: Rule[] = []
  if (roots.length) rules.push({ axes: [], tier: 0, decls: resolve(def.base ?? {}, at('base')) })
  for (const [part, intent] of Object.entries(def.parts ?? {}))
    if (parts.has(part)) rules.push({ part, axes: [], tier: 0, decls: resolve(intent, at(`part ${part}`)) })
  for (const [axis, vals] of axes)
    for (const [value, intent] of Object.entries(vals))
      if (values.get(axis)!.has(value)) rules.push({ axes: [[axis, value]], tier: 1, decls: resolve(intent, at(`${axis}=${value}`)) })
  if (roots.length)
    for (const [state, intent] of Object.entries(def.states ?? {}))
      if (states.has(state)) rules.push({ axes: [], state, tier: 2, decls: resolve(intent, at(`state ${state}`)) })
  for (const [i, c] of (def.compounds ?? []).entries()) {
    const when = Object.entries(c.when)
    if (when.every(([a, v]) => values.get(a)?.has(v)) && (!c.part || parts.has(c.part)))
      rules.push({ part: c.part, axes: when, tier: 3, decls: resolve(c.set, at(`compound ${i}`)) })
  }
  return rules.filter(r => Object.keys(r.decls).length)
}

const cond = (r: Rule) =>
  r.axes.map(([a, v]) => `[data-${a}="${v}"]`).join('') + (r.state ? PSEUDO[r.state] ?? (ARIA.has(r.state) ? `[aria-${r.state}="true"]` : `[data-${r.state}]`) : '')

/** The rule's selector, flat (`[data-g="x"]…`) or inside the group's @scope (`:scope…`). */
function selector(name: string, r: Rule, scoped: boolean, bare = false) {
  const root = scoped ? `:scope${cond(r)}` : `[data-g="${name}"]${cond(r)}${bare ? '' : ':not([data-part])'}`
  if (!r.part) return root
  const part = scoped ? `[data-part="${r.part}"]` : `[data-g="${name}"][data-part="${r.part}"]`
  return r.axes.length || r.state ? `${root} ${part}` : part
}

const isChannel = (p: string) => p.startsWith('--_')
const channelReads = (rules: Rule[]) =>
  new Set(rules.flatMap(r => Object.entries(r.decls).filter(([p]) => !isChannel(p)).flatMap(([, v]) => [...v.matchAll(/var\((--_[\w-]+)/g)].map(m => m[1]))))

/** Merge rules with identical declarations into one selector list, at the first one's place (per tier). */
function merge(rules: { sel: string; decls: Decls; tier: number }[]) {
  const out: { sels: string[]; decls: Decls; tier: number }[] = []
  const byKey = new Map<string, (typeof out)[number]>()
  for (const r of rules) {
    const key = `${r.tier}|${JSON.stringify(r.decls)}`
    const hit = byKey.get(key)
    if (hit) hit.sels.push(r.sel)
    else {
      const entry = { sels: [r.sel], decls: r.decls, tier: r.tier }
      byKey.set(key, entry)
      out.push(entry)
    }
  }
  return out
}

export type EmitOptions = {
  /** Source comments and indentation. */
  dev?: boolean
  /** Each group's rules in `@scope (group) to (nested group)`; flat selectors when false. */
  scope?: boolean
  /** Wrap selectors in `:where()` (specificity 0). The layer already puts every group rule under unlayered CSS. */
  where?: boolean
  /**
   * Write a base or part block that two or more groups resolve to identically once, before the groups. Off by
   * default: it makes the CSS smaller before compression and larger after (brotli already pays little for the repeat).
   */
  share?: boolean
  /**
   * Parts carry only `data-part` (`<span data-part="price">` inside `<li data-g="product-row">`), not `data-g` as
   * well. Needs `scope`: parts are then told apart from a nested group's by the scope's lower bound alone.
   */
  bareParts?: boolean
}

/** Readable group CSS for the call sites given. Groups no site uses emit nothing. */
export function emitGroups(groups: GroupSource[], uses: GroupUse[], { dev = false, scope = true, where = true, share = false, bareParts = false }: EmitOptions = {}): string {
  if (bareParts) (scope = true), (share = false)
  const block = (sels: string[], decls: Decls, indent: string) => {
    const list = sels.join(dev ? ', ' : ',')
    const body = Object.entries(decls).map(([p, v]) => `${indent}  ${p}: ${v};`)
    return `${indent}${where ? `:where(${list})` : list} {\n${body.join('\n')}\n${indent}}`
  }
  const used = groups.map(g => ({ g, rules: reachable(g, uses.filter(u => u.group === g.name)) })).filter(x => x.rules.length)
  // Tone channels a group sets are kept when it reads them, or when a group with no tone of its own reads them (it
  // takes them from whatever it's nested in). The rest are dropped: a tone on a soft badge needs `--_soft` and `--_text`.
  const inherited = used.filter(x => !x.rules.some(r => Object.keys(r.decls).some(isChannel))).flatMap(x => [...channelReads(x.rules)])
  for (const x of used) {
    const keep = new Set([...channelReads(x.rules), ...inherited])
    for (const r of x.rules) r.decls = Object.fromEntries(Object.entries(r.decls).filter(([p]) => !isChannel(p) || keep.has(p)))
    x.rules = x.rules.filter(r => Object.keys(r.decls).length)
  }
  // Shared blocks: tier 0 only. A base or part selector matches one group's elements, and every group's own rules
  // come after the shared ones, so moving them up can't change what wins.
  const owners = new Map<string, Set<string>>()
  if (share) for (const x of used) for (const r of x.rules) if (r.tier === 0) owners.set(JSON.stringify(r.decls), (owners.get(JSON.stringify(r.decls)) ?? new Set()).add(x.g.name))
  const shared = new Map<string, { sels: string[]; decls: Decls }>()
  const blocks: string[] = []
  for (const { g, rules } of used) {
    const own: { sel: string; decls: Decls; tier: number }[] = []
    for (const r of rules) {
      const key = JSON.stringify(r.decls)
      if (r.tier === 0 && (owners.get(key)?.size ?? 0) > 1) {
        const entry = shared.get(key) ?? shared.set(key, { sels: [], decls: r.decls }).get(key)!
        entry.sels.push(selector(g.name, r, false))
      } else own.push({ sel: selector(g.name, r, scope), decls: r.decls, tier: r.tier })
    }
    if (!own.length) continue
    const comment = dev ? `  /* ${g.name} · ${g.file}:${g.line} */\n` : ''
    const merged = merge(own)
    if (scope) {
      const inner = merged.map(m => block(m.sels, m.decls, '    ')).join('\n')
      const prelude = bareParts ? `([data-g="${g.name}"]) to ([data-g])` : `([data-g="${g.name}"]:not([data-part])) to ([data-g]:not([data-part]))`
      blocks.push(`${comment}  @scope ${prelude} {\n${inner}\n  }`)
    } else {
      blocks.push(comment + merged.map(m => block(m.sels, m.decls, '  ')).join('\n'))
    }
  }
  const head = dev && shared.size ? '  /* the same base or part in several groups, written once */\n' : ''
  const sharedBlocks = [...shared.values()].map(m => block(m.sels, m.decls, '  '))
  if (!blocks.length && !sharedBlocks.length) return ''
  return `@layer app.groups {\n${head}${[...sharedBlocks, ...blocks].join('\n')}\n}\n`
}

/**
 * The same styles as atomic CSS (one class per declaration and condition, as StyleX or Panda emit), for comparison.
 * `atoms(el)` gives the classes an element would carry for its current attributes.
 */
export function emitAtomic(groups: GroupSource[], uses: GroupUse[]) {
  const ids = new Map<string, string>()
  const css: string[] = []
  const byGroup = new Map<string, Rule[]>()
  const atom = (variant: string, p: string, v: string) => {
    const key = `${variant}|${p}|${v}`
    let id = ids.get(key)
    if (!id) {
      id = `x${ids.size.toString(36)}`
      ids.set(key, id)
      css.push(`.${id}${variant}{${p}:${v}}`)
    }
    return id
  }
  for (const g of groups) {
    const rules = reachable(g, uses.filter(u => u.group === g.name))
    byGroup.set(g.name, rules)
    for (const r of rules) for (const [p, v] of Object.entries(r.decls)) atom(r.state ? cond({ ...r, axes: [] }) : '', p, v)
  }
  /** Classes for an element with these group attributes (axis and state conditions evaluated, as cva does at runtime). */
  const atoms = (el: Element, root?: Element | null) => {
    const name = el.getAttribute('data-g')
    const rules = (name && byGroup.get(name)) || []
    const part = el.getAttribute('data-part') ?? undefined
    const host = part ? root ?? el.closest(`[data-g="${name}"]:not([data-part])`) : el
    const seen = new Set<string>()
    for (const r of rules) {
      if (r.part !== part) continue
      if (!r.axes.every(([a, v]) => host?.getAttribute(`data-${a}`) === v)) continue
      for (const [p, v] of Object.entries(r.decls)) seen.add(atom(r.state ? cond({ ...r, axes: [] }) : '', p, v))
    }
    return seen
  }
  return { css: () => css.join(''), atoms }
}
