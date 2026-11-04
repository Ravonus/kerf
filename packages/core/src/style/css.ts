// Group CSS at build (research 23 §2.5 steps 2–4, §6): resolve intents through the token table, then emit rules only
// for the axis values, states, parts and compounds that some call site can produce. Output goes in `@layer
// app.groups`, one `@scope ([data-g="x"]) to ([data-g])` per group, so its rules never reach into a nested group,
// with parts as `[data-part]` under it. A group's own tone is folded into direct token reads (`foldTones`).
// Options keep the variants the spike measured: `:where()` selectors, parts tagged with `data-g` (and then flat
// selectors), blocks shared across groups. `emitAtomic` writes the same styles as one class per declaration, for the
// spike's comparison only.
import { VOCAB } from './vocab.ts'

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

type Intent = Record<string, unknown>
export type Def = {
  base?: Intent
  axes?: Record<string, Record<string, Intent> | 'inherit'>
  parts?: Record<string, Intent>
  states?: Record<string, Intent>
  compounds?: { when: Record<string, string>; part?: string; set: Intent }[]
  defaults?: Record<string, string>
}
type Decls = Record<string, string>

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

const ARIA = new Set(['selected', 'pressed', 'checked', 'expanded', 'current', 'invalid', 'busy'])
const PSEUDO: Record<string, string> = {
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

const cond = (r: Rule) =>
  r.axes.map(([a, v]) => `[data-${a}="${v}"]`).join('') +
  (r.accent ? `[data-accent~="${r.accent}"]` : '') +
  (r.state
    ? (PSEUDO[r.state] ?? (ARIA.has(r.state) ? `[aria-${r.state}="true"]` : `[data-${r.state}]`))
    : '')

/** The rule's selector, flat (`[data-g="x"]…`) or inside the group's @scope (`:scope…`). */
function selector(name: string, r: Rule, scoped: boolean, bare = false) {
  const root = scoped
    ? `:scope${cond(r)}`
    : `[data-g="${name}"]${cond(r)}${bare ? '' : ':not([data-part])'}`
  if (!r.part) return root
  const part = scoped ? `[data-part="${r.part}"]` : `[data-g="${name}"][data-part="${r.part}"]`
  return r.axes.length || r.state ? `${root} ${part}` : part
}

const isChannel = (p: string) => p.startsWith('--_')
const channelReads = (rules: Rule[]) =>
  new Set(
    rules.flatMap((r) =>
      Object.entries(r.decls)
        .filter(([p]) => !isChannel(p))
        .flatMap(([, v]) => [...v.matchAll(/var\((--_[\w-]+)/g)].map((m) => m[1])),
    ),
  )

const CHANNEL_READ = /var\((--_[\w-]+)(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g
const substitute = (v: string, channels: Decls) =>
  v.replace(CHANNEL_READ, (m, name) => channels[name] ?? m)
const reads = (v: string) => v.includes('var(--_')

/**
 * A group's tone is local: where it sets a tone and reads the channels on the same element, the reads become the
 * tone's tokens and the channels go (`background-color: var(--_soft)` under caution → `var(--warp-color-caution-soft)`).
 * Two shapes fold, per element (the root or one part):
 * - one unconditional tone (the base or the part's block): every read on that element takes its values;
 * - tones only under conditions (axis values, compounds), reads only unconditional: each conditional tone rule
 *   gets the reads with its values, and an unconditional read becomes what it was with no tone: its fallback
 *   (`var(--_text, var(--warp-color-text-subtle))` → the subtle token), or nothing when it has none (it was unset).
 * Any other shape (a tone read by another element, reads under conditions next to conditional tones) keeps channels.
 * A group with no tone at all reads its fallbacks. So a group never takes a tone from what it's nested in; context
 * tone stays warp's `data-tone`.
 */
function foldTones(rules: Rule[]) {
  // A group with no tone anywhere reads its fallbacks: `var(--_text, var(--warp-color-text))` → the text token.
  if (!rules.some((r) => Object.keys(r.decls).some(isChannel))) {
    for (const r of rules)
      for (const [p, v] of Object.entries(r.decls))
        if (reads(v))
          r.decls[p] = v.replace(CHANNEL_READ, (m, _n, fallback) =>
            fallback === undefined ? m : fallback.trim(),
          )
    return
  }
  const targets = new Set(rules.map((r) => r.part))
  for (const t of targets) {
    const on = rules.filter((r) => r.part === t)
    const setters = on.filter((r) => Object.keys(r.decls).some(isChannel))
    if (!setters.length) continue
    const readers = on.filter((r) =>
      Object.entries(r.decls).some(([p, v]) => !isChannel(p) && reads(v)),
    )
    // Channels read by rules on other elements (a part reading its root's tone) must stay.
    if (
      rules.some(
        (r) => r.part !== t && Object.entries(r.decls).some(([p, v]) => !isChannel(p) && reads(v)),
      )
    )
      continue
    const drop = (r: Rule) =>
      (r.decls = Object.fromEntries(Object.entries(r.decls).filter(([p]) => !isChannel(p))))
    if (setters.length === 1 && setters[0]!.tier === 0) {
      const channels = { ...setters[0]!.decls }
      for (const r of readers)
        for (const [p, v] of Object.entries(r.decls))
          if (!isChannel(p)) r.decls[p] = substitute(v, channels)
      drop(setters[0]!)
    } else if (setters.every((s) => s.tier > 0) && readers.every((r) => r.tier === 0 && !r.state)) {
      const read = readers.flatMap((r) =>
        Object.entries(r.decls).filter(([p, v]) => !isChannel(p) && reads(v)),
      )
      for (const s of setters) {
        const channels = { ...s.decls }
        drop(s)
        for (const [p, v] of read) s.decls[p] = substitute(v, channels)
      }
      // Untoned, a read is its fallback (`var(--_text, subtle)` → subtle) or unset (no fallback: leave it out).
      for (const r of readers)
        r.decls = Object.fromEntries(
          Object.entries(r.decls).flatMap(([p, v]): [string, string][] => {
            if (isChannel(p) || !reads(v)) return [[p, v]]
            const bare = v.replace(CHANNEL_READ, (m, _n, fallback) =>
              fallback === undefined ? '\0' : fallback.trim(),
            )
            return bare.includes('\0') ? [] : [[p, bare]]
          }),
        )
    }
  }
}

/** Greedy nearest neighbour on shared declarations (Jaccard), from the first group by name. */
function bySimilarity<T extends { g: GroupSource; rules: Rule[] }>(xs: T[]): T[] {
  const sets = new Map(
    xs.map((x) => [
      x,
      new Set(x.rules.flatMap((r) => Object.entries(r.decls).map(([p, v]) => `${p}:${v}`))),
    ]),
  )
  const sim = (a: T, b: T) => {
    const [A, B] = [sets.get(a)!, sets.get(b)!]
    let n = 0
    for (const d of A) if (B.has(d)) n++
    return n / (A.size + B.size - n || 1)
  }
  const left = [...xs].sort((a, b) => a.g.name.localeCompare(b.g.name))
  const out = left.length ? [left.shift()!] : []
  while (left.length) {
    const last = out[out.length - 1]!
    let best = 0
    for (let i = 1; i < left.length; i++) if (sim(last, left[i]!) > sim(last, left[best]!)) best = i
    out.push(left.splice(best, 1)[0]!)
  }
  return out
}

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
  /**
   * Wrap selectors in `:where()` (specificity 0). Off by default: `@layer app.groups` already puts every group rule
   * under unlayered CSS and later layers (Tailwind's utilities) whatever the specificity, and inside the layer two
   * groups never match one element (a nested root is the scope's limit), while one group's rules already rise in
   * specificity in the order they should win (base, axis, compound).
   */
  where?: boolean
  /**
   * Write a base or part block that two or more groups resolve to identically once, before the groups: in one
   * `@scope` over those groups, or flat with `taggedParts`.
   */
  share?: boolean
  /**
   * Parts carry `data-g` as well as `data-part` (the compiler's `taggedParts`). Off (the default), a part is only
   * `<span data-part="price">` inside `<li data-g="product-row">`, and the group's `@scope` tells it apart from a
   * nested group's parts, so `scope` is forced on.
   */
  taggedParts?: boolean
  /** Fold a group's own tone into its declarations where the shape allows (`foldTones`). */
  fold?: boolean
  /**
   * Group order in the file. Groups never compete for an element, so order can't change a computed style; it only
   * changes compression. `similar` (the default) puts each group next to the one it shares most declarations with,
   * starting from the first by name, so the output is the same whatever order files compiled in.
   */
  order?: 'similar' | 'name' | 'given'
}

/** Readable group CSS for the call sites given. Groups no site uses emit nothing. */
export function emitGroups(
  groups: GroupSource[],
  uses: GroupUse[],
  {
    dev = false,
    scope = true,
    where = false,
    share = false,
    taggedParts = false,
    fold = true,
    order = 'similar',
  }: EmitOptions = {},
): string {
  if (!taggedParts) scope = true
  const block = (sels: string[], decls: Decls, indent: string) => {
    const list = sels.join(dev ? ', ' : ',')
    const body = Object.entries(decls).map(([p, v]) => `${indent}  ${p}: ${v};`)
    return `${indent}${where ? `:where(${list})` : list} {\n${body.join('\n')}\n${indent}}`
  }
  let used = groups
    .map((g) => ({
      g,
      rules: reachable(
        g,
        uses.filter((u) => u.group === g.name),
      ),
    }))
    .filter((x) => x.rules.length)
  if (fold) for (const x of used) foldTones(x.rules)
  if (order === 'similar') used = bySimilarity(used)
  else if (order === 'name') used.sort((a, b) => a.g.name.localeCompare(b.g.name))
  // Tone channels a group sets are kept when it reads them, or when a group with no tone of its own reads them (it
  // takes them from whatever it's nested in). The rest are dropped: a tone on a soft badge needs `--_soft` and `--_text`.
  const inherited = used
    .filter((x) => !x.rules.some((r) => Object.keys(r.decls).some(isChannel)))
    .flatMap((x) => [...channelReads(x.rules)])
  for (const x of used) {
    const keep = new Set([...channelReads(x.rules), ...inherited])
    for (const r of x.rules)
      r.decls = Object.fromEntries(
        Object.entries(r.decls).filter(([p]) => !isChannel(p) || keep.has(p)),
      )
    x.rules = x.rules.filter((r) => Object.keys(r.decls).length)
  }
  // Shared blocks: tier 0 only. A base or part selector matches one group's elements, and every group's own rules
  // come after the shared ones, so moving them up can't change what wins.
  const owners = new Map<string, Set<string>>()
  if (share && taggedParts)
    for (const x of used)
      for (const r of x.rules)
        if (r.tier === 0)
          owners.set(
            JSON.stringify(r.decls),
            (owners.get(JSON.stringify(r.decls)) ?? new Set()).add(x.g.name),
          )
  const shared = new Map<string, { sels: string[]; decls: Decls }>()
  // With bare parts, a block several groups share goes in one @scope over all of them. It's only written that way
  // when no group in the list has a root or part the list names but doesn't own (that element would pick it up).
  const scopedShares: string[] = []
  const moved = new Set<Rule>()
  if (share && !taggedParts) {
    const byKey = new Map<string, { g: GroupSource; r: Rule }[]>()
    for (const { g, rules } of used)
      for (const r of rules)
        if (r.tier === 0)
          byKey.set(JSON.stringify(r.decls), [
            ...(byKey.get(JSON.stringify(r.decls)) ?? []),
            { g, r },
          ])
    for (const es of byKey.values()) {
      const names = [...new Set(es.map((e) => e.g.name))]
      if (names.length < 2) continue
      const sels = [...new Set(es.map((e) => (e.r.part ? `[data-part="${e.r.part}"]` : ':scope')))]
      const ok = names.every((n) => {
        const mine = es.filter((e) => e.g.name === n)
        const def = es.find((e) => e.g.name === n)!.g.def
        return sels.every((sel) =>
          sel === ':scope'
            ? mine.some((e) => !e.r.part)
            : mine.some((e) => sel === `[data-part="${e.r.part}"]`) ||
              !(sel.slice(12, -2) in (def.parts ?? {})),
        )
      })
      if (!ok) continue
      for (const e of es) moved.add(e.r)
      const comment = dev ? `  /* shared by ${names.join(', ')} */\n` : ''
      scopedShares.push(
        `${comment}  @scope (${names.map((n) => `[data-g="${n}"]`).join(dev ? ', ' : ',')}) to ([data-g]) {\n${block(sels, es[0]!.r.decls, '    ')}\n  }`,
      )
    }
  }
  const blocks: string[] = [...scopedShares]
  for (const { g, rules } of used) {
    const own: { sel: string; decls: Decls; tier: number }[] = []
    for (const r of rules) {
      const key = JSON.stringify(r.decls)
      if (moved.has(r)) continue
      if (r.tier === 0 && (owners.get(key)?.size ?? 0) > 1) {
        const entry = shared.get(key) ?? shared.set(key, { sels: [], decls: r.decls }).get(key)!
        entry.sels.push(selector(g.name, r, false))
      } else own.push({ sel: selector(g.name, r, scope), decls: r.decls, tier: r.tier })
    }
    if (!own.length) continue
    const comment = dev ? `  /* ${g.name} · ${g.file}:${g.line} */\n` : ''
    const merged = merge(own)
    if (scope) {
      const inner = merged.map((m) => block(m.sels, m.decls, '    ')).join('\n')
      const prelude = !taggedParts
        ? `([data-g="${g.name}"]) to ([data-g])`
        : `([data-g="${g.name}"]:not([data-part])) to ([data-g]:not([data-part]))`
      blocks.push(`${comment}  @scope ${prelude} {\n${inner}\n  }`)
    } else {
      blocks.push(comment + merged.map((m) => block(m.sels, m.decls, '  ')).join('\n'))
    }
  }
  const head =
    dev && shared.size ? '  /* the same base or part in several groups, written once */\n' : ''
  const sharedBlocks = [...shared.values()].map((m) => block(m.sels, m.decls, '  '))
  if (!blocks.length && !sharedBlocks.length) return ''
  return `@layer warp, app, theme, base, components, utilities;\n@layer app.groups {\n${head}${[...sharedBlocks, ...blocks].join('\n')}\n}\n`
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
    const rules = reachable(
      g,
      uses.filter((u) => u.group === g.name),
    )
    byGroup.set(g.name, rules)
    for (const r of rules)
      for (const [p, v] of Object.entries(r.decls))
        atom(r.state ? cond({ ...r, axes: [] }) : '', p, v)
  }
  /** Classes for an element with these group attributes (axis and state conditions evaluated, as cva does at runtime). */
  const atoms = (el: Element, root?: Element | null) => {
    const part = el.getAttribute('data-part') ?? undefined
    const host = part
      ? (root ??
        (el.hasAttribute('data-g') ? el.parentElement : el)?.closest('[data-g]:not([data-part])'))
      : el
    const name = host?.getAttribute('data-g')
    const rules = (name && byGroup.get(name)) || []
    const seen = new Set<string>()
    for (const r of rules) {
      if (r.part !== part) continue
      if (!r.axes.every(([a, v]) => host?.getAttribute(`data-${a}`) === v)) continue
      for (const [p, v] of Object.entries(r.decls))
        seen.add(atom(r.state ? cond({ ...r, axes: [] }) : '', p, v))
    }
    return seen
  }
  return { css: () => css.join(''), atoms }
}
