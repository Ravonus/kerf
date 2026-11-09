import {
  ARIA,
  PSEUDO,
  reachable,
  type Decls,
  type GroupSource,
  type GroupUse,
  type Rule,
} from './base.ts'

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
 * tone stays Warp's `data-tone`.
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

type Used = { g: GroupSource; rules: Rule[] }
type Block = (sels: string[], decls: Decls, indent: string) => string

function scopedShared(
  used: Used[],
  share: boolean,
  taggedParts: boolean,
  dev: boolean,
  block: Block,
) {
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
  return { scopedShares, moved }
}

function groupBlocks({
  used,
  scopedShares,
  moved,
  owners,
  shared,
  scope,
  taggedParts,
  dev,
  block,
}: {
  used: Used[]
  scopedShares: string[]
  moved: Set<Rule>
  owners: Map<string, Set<string>>
  shared: Map<string, { sels: string[]; decls: Decls }>
  scope: boolean
  taggedParts: boolean
  dev: boolean
  block: Block
}) {
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
  return blocks
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
  const { scopedShares, moved } = scopedShared(used, share, taggedParts, dev, block)
  const blocks = groupBlocks({
    used,
    scopedShares,
    moved,
    owners,
    shared,
    scope,
    taggedParts,
    dev,
    block,
  })
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
