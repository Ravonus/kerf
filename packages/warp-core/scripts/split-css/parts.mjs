// A part belongs to its own component. `[data-scope="dialog"] [data-part="mark"]` was written for the dialog's own
// mark, but as a descendant selector it also reached the mark of a checkbox inside the dialog's body, and that
// checkbox then rendered with the dialog's sizing. This file reads selectors well enough to find every `[data-part]`
// and the scope it hangs from, so the split can fence each descendant part in (`guard`) and a test can prove no
// shipped part selector is left loose (`loose`).
//
// The fence stops at the other components that have a part of the same name (`owners`), less the ones the scope is
// built from (`composes`: SideNav styles its NavList's parts on purpose). Layout boxes (stack, row, grid) have no
// parts, so a part an app puts in a Stack inside an AuthScreen is still the AuthScreen's.

import { parseList } from './selector.mjs'

/** The scopes and parts a compound itself stands on, `:where()`/`:is()` of plain compounds included. */
// behaviours that act as a component without a data-scope: their parts hang from them as a scope's do
const HOSTS = new Set(['data-copy', 'data-hamburger', 'data-theme-toggle', 'data-still'])

function own(compound) {
  const scopes = new Set(),
    parts = new Set()
  for (const s of compound.simples) {
    if (s.kind === 'attr' && s.name === 'data-scope' && s.value) scopes.add(s.value)
    if (s.kind === 'attr' && HOSTS.has(s.name)) scopes.add(`[${s.name}]`)
    if (s.kind === 'attr' && s.name === 'role' && /^(option|listbox)$/.test(s.value ?? ''))
      scopes.add(`[role="${s.value}"]`)
    // a class is a host of its own (`.crop` in the cropper)
    if (s.kind === 'other' && compound.simples.length && s.start < s.end) {
      const text = s.text
      if (text?.startsWith('.')) scopes.add(text)
    }
    if (s.kind === 'attr' && s.name === 'data-part' && s.value) parts.add(s.value)
    if (
      s.kind === 'pseudo' &&
      /^(where|is)$/.test(s.name) &&
      s.args?.every((c) => c.items.length === 1)
    ) {
      // a choice of compounds: the compound stands on a part (or scope) if every choice does
      const each = s.args.map((c) => own(c.items[0]))
      if (each.every((o) => o.parts.size))
        for (const o of each) for (const p of o.parts) parts.add(p)
      if (each.every((o) => o.scopes.size))
        for (const o of each) for (const p of o.scopes) scopes.add(p)
    } else if (s.kind === 'pseudo' && /^(where|is)$/.test(s.name) && s.args?.length) {
      // a choice of complexes beside other simples (`:is([data-scope="field"] > [data-part="control"], …)[data-sweep]`):
      // the element hangs from a scope when every choice names one
      const each = s.args.map((c) =>
        c.items.flatMap((i) => (i.kind === 'compound' ? [...own(i).scopes] : [])).at(-1),
      )
      if (each.every(Boolean)) for (const x of each) scopes.add(x)
    }
  }
  return { scopes, parts }
}

/** Expand a complex selector into flat paths, opening any compound that is just `:where(...)`/`:is(...)` of complexes. */
function paths(complex, prefix = []) {
  let out = [prefix]
  for (const item of complex.items) {
    if (item.kind === 'comb') {
      out = out.map((p) => [...p, item])
      continue
    }
    const group =
      item.simples.length === 1 &&
      item.simples[0].kind === 'pseudo' &&
      /^(where|is)$/.test(item.simples[0].name) &&
      item.simples[0].args?.length
    if (group) {
      const next = []
      for (const p of out) for (const c of item.simples[0].args) next.push(...paths(c, p))
      out = next
    } else out = out.map((p) => [...p, item])
  }
  return out
}

/**
 * Every `[data-part]` compound in a selector list, with the scope(s) it hangs from and how: `same` (the part sits on
 * the scope's own element), `child` (only `>`, `+` or `~` between), `descendant` (a space somewhere between), or
 * `bare` (no scope before it at all). `fenced` says the compound already carries a fence against nested scopes.
 */
export function partsOf(selectorText, base = 0) {
  const found = []
  for (const complex of parseList(selectorText, base))
    for (const path of paths(complex)) {
      let lastOf = -1
      for (let i = 0; i < path.length; i++) {
        const item = path[i]
        if (item.kind !== 'compound') continue
        const { parts, scopes } = own(item)
        if (!parts.size) continue
        if (scopes.size) {
          found.push({ compound: item, parts, scopes, how: 'same' })
          lastOf = found.length - 1
          continue
        }
        let how = 'child',
          home = null,
          viaPart = false
        for (let j = i - 1; j >= 0; j--) {
          const prev = path[j]
          if (prev.kind === 'comb') {
            if (prev.value === ' ' && !viaPart) how = 'descendant'
            continue
          }
          const o = own(prev)
          if (o.scopes.size) {
            home = o.scopes
            break
          }
          // a child of another part hangs from that part, which answers for itself
          if (o.parts.size && how === 'child') viaPart = true
        }
        if (viaPart) how = 'part'
        found.push({
          compound: item,
          parts,
          scopes: home ?? new Set(),
          how: home || how === 'part' ? how : 'bare',
        })
        lastOf = found.length - 1
      }
      if (lastOf >= 0) found[lastOf].last = true
    }
  return found.map((f) => ({ ...f, fenced: fenced(f.compound) }))
}

const fenced = (compound) =>
  compound.simples.some(
    (s) =>
      s.kind === 'pseudo' && s.name === 'not' && /\[data-scope[\]=][^]*\*\s*\)*$/.test(s.raw ?? ''),
  )

// pseudo-elements end a compound: the fence goes before them (`[data-part="x"]:not(...)::before`)
const ELEMENT =
  /^(before|after|first-line|first-letter|marker|placeholder|selection|backdrop|file-selector-button)$/
const insertAt = (compound) => {
  const first = compound.simples.find(
    (s) => s.kind === 'pseudo' && (s.double || ELEMENT.test(s.name)),
  )
  return first ? first.start : compound.end
}

const scopeSel = (scopes) => {
  const list = [...scopes]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((s) => (s.startsWith('[') ? s : `[data-scope="${s}"]`))
  return list.length === 1 ? list[0] : `:is(${list.join(',')})`
}

/**
 * The components a part fence stops at: the ones with a part of the same name (no other component can hold one),
 * less the scope itself and the components it is built from (`composes`), which it styles on purpose.
 */
export function others(scopes, parts, { owners: owned, composes }) {
  const out = new Set()
  for (const p of parts) for (const s of owned.get(p) ?? []) out.add(s)
  for (const x of scopes) {
    out.delete(x)
    for (const c of composes[x] ?? []) out.delete(c)
  }
  return out
}

/**
 * `[data-scope="X"] [data-part="P"]` → `…[data-part="P"]:not(X S *:not(X S X *))`, with S the other components that
 * have a P: inside one of them the P is theirs, unless another X sits between that one and it. So a dialog's mark rule
 * misses the mark of a checkbox in the dialog, and still reaches the title of a dialog in a card in a dialog. (One
 * more level, an S in that inner X, would take a third copy of S per rule; it's left open.)
 */
export const fence = (scopes, other) => {
  const x = scopeSel(scopes),
    s = scopeSel(other)
  return `:not(${x} ${s} *:not(${x} ${s} ${x} *))`
}

/** Each style rule's selector text in a stylesheet, with its offset; at-rule blocks are walked into. */
export function selectors(css) {
  const out = []
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const scan = (from, to) => {
    let i = from
    while (i < to) {
      const open = text.indexOf('{', i)
      if (open < 0 || open >= to) return
      const prelude = text.slice(i, open)
      const start = i + prelude.search(/\S|$/)
      // matching close
      let depth = 0,
        j = open
      for (; j < to; j++) {
        if (text[j] === '{') depth++
        else if (text[j] === '}' && --depth === 0) break
      }
      const head = prelude.trim()
      if (head.startsWith('@')) {
        if (/^@(media|container|supports|layer|scope|starting-style|document)\b/.test(head))
          scan(open + 1, j)
      } else if (head && !/^(from|to|\d)/.test(head))
        out.push({ text: text.slice(start, open).trimEnd(), at: start })
      i = j + 1
      // skip declarations/semicolons inside a block before the next rule (top-level `@import x;` etc.)
      const semi = text.indexOf(';', i)
      const next = text.indexOf('{', i)
      if (
        semi >= 0 &&
        semi < next &&
        !text.slice(i, semi).includes('}') &&
        /^\s*@/.test(text.slice(i, semi))
      )
        i = semi + 1
    }
  }
  scan(0, text.length)
  return out
}

/** The stylesheet with every descendant part fenced against the nested components that have a part of its name. */
export function guard(css, ctx) {
  const inserts = new Map()
  for (const { text, at } of selectors(css))
    for (const f of partsOf(text, at))
      if (f.how === 'descendant' && !f.fenced) {
        const where = insertAt(f.compound)
        const prev = inserts.get(where) ?? { scopes: new Set(), parts: new Set() }
        for (const x of f.scopes) prev.scopes.add(x)
        for (const p of f.parts) prev.parts.add(p)
        inserts.set(where, prev)
      }
  let out = css
  for (const where of [...inserts.keys()].sort((a, b) => b - a)) {
    const { scopes, parts } = inserts.get(where)
    const other = others(scopes, parts, ctx)
    if (other.size) out = out.slice(0, where) + fence(scopes, other) + out.slice(where)
  }
  return out
}

/**
 * Part selectors that could reach into a nested component: a bare one whose name a component also uses, and a
 * descendant one with no fence while another component has a part of its name. `primitives` are the shared parts
 * (the sweep border, label characters) that mean the same thing in every component.
 */
export function loose(css, ctx, primitives = new Set()) {
  const bad = []
  for (const { text, at } of selectors(css)) {
    const found = partsOf(text, at)
    // the scopes every path through a compound hangs from, as guard() fences them
    const homes = new Map()
    for (const f of found)
      if (f.how === 'descendant')
        for (const x of f.scopes)
          (homes.get(f.compound) ?? homes.set(f.compound, new Set()).get(f.compound)).add(x)
    for (const f of found.filter((x) => x.last)) {
      if ([...f.parts].every((p) => primitives.has(p))) continue
      if (harmless(f.compound)) continue
      const reaches =
        (f.how === 'bare' && [...f.parts].some((p) => !primitives.has(p))) ||
        (f.how === 'descendant' && !f.fenced && others(homes.get(f.compound), f.parts, ctx).size)
      if (reaches)
        bad.push({ selector: text.replace(/\s+/g, ' '), parts: [...f.parts], how: f.how })
    }
  }
  return bad
}

// a rule only about being hidden, skeleton-loading, a script's focus target or a part that opted into the sweep
// itself says the same for every component
const harmless = (compound) =>
  compound.simples.some(
    (s) =>
      (s.kind === 'attr' &&
        (s.name === 'hidden' ||
          s.name === 'popover' ||
          s.name === 'data-skel' ||
          s.name === 'data-sweep' ||
          (s.name === 'tabindex' && s.value === '-1'))) ||
      (s.kind === 'pseudo' &&
        /^(where|is)$/.test(s.name) &&
        s.args?.length &&
        s.args.every((c) => c.items.length === 1 && harmless(c.items[0]))),
  )

/** Which scopes have a part of each name, from the spec's sheets: every part a rule hangs from a scope. */
export function owners(sheets) {
  const out = new Map()
  for (const css of sheets)
    for (const { text, at } of selectors(css))
      for (const f of partsOf(text, at))
        if (f.how !== 'bare' && f.how !== 'same')
          for (const p of f.parts)
            for (const x of f.scopes)
              // a behaviour host (`[data-copy]`, `.crop`) anchors its parts but is no component to stop at
              if (!/^[[.]/.test(x)) (out.get(p) ?? out.set(p, new Set()).get(p)).add(x)
  return out
}
