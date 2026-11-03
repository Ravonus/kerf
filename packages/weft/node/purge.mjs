// Drops the CSS a build can't reach, as Tailwind does: warp's rules are keyed on data-* values, so a rule whose
// `[data-scope="knob"]` appears nowhere in the built JS or HTML can never match. Then the custom properties and
// keyframes nothing refers to any more go too. It only ever looks for a value as a word in the output, so a name the
// app builds at run time from parts, or a dial a server sets from a cookie with no list of values, needs `keep`.

// Attributes set from fixed names, in a component or in the app: a value that's in no built file can't reach them. That
// takes in the dials with tiers (data-expression, data-fields, data-density, data-flair, data-form): an app that switches a
// tier at run time has the tier's name in its build, and `setDial` brings all of them. data-theme and data-motion stay:
// those rules answer the OS, and they're small. data-flow names a scroll motion from markup, so a motion no page asks
// for goes with its keyframes.
const KEYED = /\[data-(?:scope|part|variant|tone|emphasis|size|appearance|flow|expression|fields|density|flair|form)=["']?([^\]"']+)["']?\]/g
const OWNED_PROP = /^--(?:warp-|_)/
// Any other data-* attribute has to be named in the build as well, as itself or as its dataset key: `[data-lift]` is
// written in markup or set with `el.dataset.lift`, so a build with neither can't reach it. `data-` in a build (a name
// put together at run time) keeps them all. The dials the OS or a stored choice set on the root stay.
const ATTR = /\[data-([\w-]+)/g
const NAMED = /^(?:scope|part|variant|tone|emphasis|size|appearance|flow|expression|fields|density|flair|form|theme|motion|pointer)$/
const camel = name => name.replace(/-(\w)/g, (_, c) => c.toUpperCase())

/** Split at top-level `sep`, skipping strings and brackets. */
function split(text, sep) {
  const out = []
  let depth = 0, quote = '', from = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === sep && depth === 0) { out.push(text.slice(from, i)); from = i + 1 }
  }
  out.push(text.slice(from))
  return out
}

/** Index of the bracket closing the one at `open`. */
function closing(text, open) {
  const [a, b] = text[open] === '{' ? '{}' : '()'
  let depth = 0, quote = ''
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") quote = c
    else if (c === a) depth++
    else if (c === b && --depth === 0) return i
  }
  return text.length - 1
}

/** Nodes of a stylesheet: `{ head, body }` for a block, `{ head }` for a statement such as `@layer a,b;`. */
export function parse(css) {
  const nodes = []
  let i = 0, quote = '', depth = 0, start = 0
  for (; i < css.length; i++) {
    const c = css[i]
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") quote = c
    else if (c === '/' && css[i + 1] === '*') { const end = css.indexOf('*/', i + 2); css = css.slice(0, i) + css.slice(end < 0 ? css.length : end + 2); i--; }
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (depth === 0 && c === ';') { const head = css.slice(start, i).trim(); if (head) nodes.push({ head }); start = i + 1 }
    else if (depth === 0 && c === '{') {
      const end = closing(css, i)
      nodes.push({ head: css.slice(start, i).trim(), body: css.slice(i + 1, end) })
      i = end; start = i + 1
    }
  }
  return nodes
}

const print = nodes => nodes.map(n => (n.body === undefined ? `${n.head};` : `${n.head}{${n.body}}`)).join('')

const GROUPING = /^@(?:media|supports|layer|container|scope|starting-style|document)\b/

/** Can this complex selector match, given the words in the build? `:not()` is no evidence either way. */
export function reachable(selector, has) {
  let rest = selector
  for (;;) {
    const m = /:(not|is|where|has|matches)\(/.exec(rest)
    if (!m) break
    const open = m.index + m[0].length - 1, end = closing(rest, open)
    if (m[1] !== 'not' && !split(rest.slice(open + 1, end), ',').some(s => reachable(s, has))) return false
    rest = rest.slice(0, m.index) + rest.slice(end + 1)
  }
  for (const m of rest.matchAll(KEYED)) if (!has(m[1])) return false
  for (const [, name] of rest.matchAll(ATTR)) if (!NAMED.test(name) && !has(`data-${name}`) && !has(camel(name))) return false
  return true
}

/** A selector without the `:is()` and `:where()` alternatives that can't match. Call it on a reachable selector. */
function trim(selector, has) {
  const m = /:(is|where)\(/g
  let out = selector
  for (let hit; (hit = m.exec(out));) {
    const open = hit.index + hit[0].length - 1, end = closing(out, open)
    const kept = split(out.slice(open + 1, end), ',').filter(s => reachable(s, has)).map(s => trim(s, has))
    out = out.slice(0, open + 1) + kept.join(',') + out.slice(end)
    m.lastIndex = open + 1 + kept.join(',').length
  }
  return out
}

function prune(nodes, has) {
  const out = []
  for (const n of nodes) {
    if (n.body === undefined || n.head.startsWith('@font-face') || /^@(?:-\w+-)?(keyframes|property|page|counter-style)\b/.test(n.head)) { out.push(n); continue }
    if (GROUPING.test(n.head)) {
      const inner = prune(parse(n.body), has)
      if (inner.length) out.push({ head: n.head, body: print(inner) })
      continue
    }
    const kept = split(n.head, ',').filter(s => reachable(s, has)).map(s => trim(s, has))
    if (kept.length) out.push({ head: kept.join(','), body: n.body })
  }
  return out
}

/** One pass over a sheet: drops `--x:...` declarations `used` says no. */
function dropProps(css, used) {
  const sweep = nodes => nodes.map(n => {
    if (n.body === undefined || /^@(?:-\w+-)?(?:keyframes|font-face|property)\b/.test(n.head)) return n
    if (GROUPING.test(n.head)) return { head: n.head, body: print(sweep(parse(n.body))) }
    if (n.body.includes('{')) return n
    return { head: n.head, body: split(n.body, ';').filter(d => {
      const name = d.slice(0, d.indexOf(':')).trim()
      return !OWNED_PROP.test(name) || used(name)
    }).join(';') }
  }).filter(n => n.body === undefined || n.body.trim())
  return print(sweep(parse(css)))
}

const reads = sheets => new Set(sheets.join('').replace(/(?<=[{;])\s*--[\w-]+\s*:/g, ':').match(/--[\w-]+/g) ?? [])

function dropKeyframes(css, rest, has) {
  const walk = list => list.flatMap(n => {
    const name = /^@(?:-\w+-)?keyframes\s+(\S+)/.exec(n.head)?.[1]
    if (name) return rest.includes(name) || has(name) ? [n] : []
    if (n.body !== undefined && GROUPING.test(n.head)) return [{ head: n.head, body: print(walk(parse(n.body))) }]
    return [n]
  })
  return print(walk(parse(css)))
}

/**
 * `:where(A B)` to `:where(A) :where(B)`: the same selector at the same specificity, but a browser files a rule by its last
 * compound and can't see into a complex `:where()`, so every element on the page is tested against it. warp wraps all of
 * its rules, and that was most of its style time. Each piece stays wrapped: `:where()` forgives an unknown pseudo-class
 * and a plain selector list doesn't.
 */
export function unnest(selector) {
  return split(selector, ',').flatMap(one => {
    const s = one.trim()
    if (!s.startsWith(':where(')) return [s]
    const end = closing(s, 6), tail = s.slice(end + 1)
    return split(s.slice(7, end), ',').map(c => compounds(c.trim()).map(p => (/^[ >+~]$/.test(p) ? p : `:where(${p})`)).join('') + tail)
  }).join(',')
}

/** A complex selector as compounds and combinators, in order. */
function compounds(selector) {
  const out = []
  let depth = 0, quote = '', cur = ''
  for (const c of selector.replace(/\s*([>+~])\s*/g, '$1')) {
    if (quote) { cur += c; if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (depth === 0 && ' >+~'.includes(c) && cur) { out.push(cur, c); cur = '' } else cur += c
  }
  return cur ? [...out, cur] : out
}

function flatten(css) {
  const walk = nodes => print(nodes.map(n => {
    if (n.body === undefined) return n
    if (GROUPING.test(n.head)) return { head: n.head, body: walk(parse(n.body)) }
    return n.head.startsWith('@') ? n : { head: unnest(n.head), body: n.body }
  }))
  return walk(parse(css))
}

const ANIMATED = /^@(?:-\w+-)?keyframes\b/
/** A sheet without its keyframes at any depth (warp's sit in its layers): what's left is what can run one. */
const unanimated = nodes => nodes.filter(n => !ANIMATED.test(n.head)).map(n => (n.body !== undefined && GROUPING.test(n.head) ? { head: n.head, body: print(unanimated(parse(n.body))) } : n))

/** The words of built JS or HTML, in the form `purge` reads. A word ending in `-` came from a template: it covers a prefix. */
export function words(sources, keep = []) {
  const all = new Set(keep), stems = []
  for (const src of sources) for (const w of src.match(/-{0,2}[A-Za-z_][\w-]*/g) ?? []) all.add(w)
  for (const w of all) if (w.endsWith('-')) stems.push(w)
  return { has: w => all.has(w) || stems.some(s => w.startsWith(s) && s !== '-') }
}

/**
 * Every stylesheet of a build together: a route's sheet reads tokens and runs keyframes that the layout's defines, so
 * "nothing refers to it" only means something across all of them.
 * @param {string[]} sheets  @param {{ has: (word: string) => boolean }} found from `words`
 */
export function purge(sheets, found) {
  const { has } = found
  let out = sheets.map(css => print(prune(parse(css), has)))
  // keyframes and tokens free each other: a dropped animation's keyframes may be the last to read a token
  for (;;) {
    const rest = out.map(css => print(unanimated(parse(css)))).join('')
    out = out.map(css => dropKeyframes(css, rest, has))
    const seen = reads(out)
    const next = out.map(css => dropProps(css, name => seen.has(name) || has(name)))
    if (next.join('') === out.join('')) break
    out = next
  }
  return out.map(flatten)
}

/** Interaction: a state nothing is in when the page first paints. */
const STATE = /:(?:hover|active|focus|focus-visible|focus-within|visited|popover-open|modal|-moz-[\w-]+|-webkit-[\w-]+)\b/
/** Attributes set on the root from outside the HTML, so their rules could match any page. Tier dials are read from the head. */
const ROOT_DIAL = /^data-(?:theme|motion|pointer)$/ // a stored choice or the OS: any page, any visitor

export { markup } from '../src/markup.mjs'

/** Every `@layer` name in the order the sheet first declares it. The first-paint sheet's order must be the whole sheet's. */
export function layerOrder(css) {
  const names = []
  const walk = nodes => { for (const n of nodes) {
    const m = /^@layer\b\s*(.*)$/.exec(n.head)
    if (m) for (const name of m[1].split(',').map(x => x.trim()).filter(Boolean)) if (!names.includes(name)) names.push(name)
    if (n.body !== undefined && GROUPING.test(n.head)) walk(parse(n.body))
  } }
  walk(parse(css))
  return names
}

/**
 * What a selector needs in the HTML: `all` it must hold, and `any`, lists of which one must hold (`:is()`, `:where()`).
 * Null when it needs a state nothing is in at first paint. Only ever says no on evidence: `:not()` is ignored.
 */
function needs(selector) {
  let rest = selector.replace(/::[\w-]+(\([^)]*\))?/g, '')
  const any = []
  for (;;) {
    const m = /:(not|is|where|has|matches)\(/.exec(rest)
    if (!m) break
    const open = m.index + m[0].length - 1, end = closing(rest, open)
    if (m[1] !== 'not') {
      const inner = split(rest.slice(open + 1, end), ',').map(needs).filter(Boolean)
      if (!inner.length) return null
      if (inner.length === 1) { any.push(...inner[0].any); inner[0].all.forEach(k => any.push([k])) }
      else if (inner.every(i => i.all.length)) any.push(inner.map(i => i.all[0]))
    }
    rest = rest.slice(0, m.index) + rest.slice(end + 1)
  }
  if (STATE.test(rest)) return null
  rest = rest.replace(/:[\w-]+(\([^)]*\))?/g, '')
  const all = []
  for (const [whole, name, op, value] of rest.matchAll(/\[([\w:-]+)(?:([~|^$*]?=)["']?([^\]"']*)["']?(?:\s+[is])?)?\]/g)) {
    rest = rest.replace(whole, '')
    if (ROOT_DIAL.test(name)) continue
    all.push(op === '=' ? `[${name}=${value}]` : `[${name}]`)
  }
  for (const [word] of rest.matchAll(/[.#]?[A-Za-z_][\w-]*/g)) all.push(/^[.#]/.test(word) ? word : word.toLowerCase())
  for (const list of any) if (list.length === 1) { all.push(list[0]); list.length = 0 }
  return { all, any: any.filter(l => l.length) }
}

/**
 * Stylesheets as a table a server joins with lookups alone. Each rule that can show in a first paint is a piece, and each
 * token a keyless rule declares is one. `index` maps a word of HTML (see `markup`) to pieces that might need it; `alts` says
 * what else each needs; `deps` gives the tokens and keyframes it reads. Hover and focus are not pieces.
 * @param {[string, string][]} sheets  `[name, css]`, in cascade order
 */
export function pieces(sheets, keep = []) {
  const wraps = [''], list = [], alts = [], reading = [], tokens = new Map(), frames = new Map(), always = []
  const count = new Map()
  const all = sheets.map(s => s[1]).join('')
  for (const m of all.matchAll(/\[[\w:-]+(?:=["']?[^\]"']*["']?)?\]|[.#][A-Za-z_][\w-]*/g)) {
    const k = m[0].replace(/["']/g, '')
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  const add = (owner, wrap, head, body, name) => {
    const id = list.length, text = `${head}{${body}}`
    list.push([owner, wrap, head, body])
    alts.push(null)
    const read = new Set(text.replace(/(?<=[{;])\s*--[\w-]+\s*:/g, ':').match(/--[\w-]+/g) ?? [])
    reading.push({ read, anim: /animation/.test(text) ? text : '' })
    if (name) tokens.set(name, [...(tokens.get(name) ?? []), id])
    return id
  }
  const wrapOf = heads => {
    const open = heads.map(h => `${h}{`).join('')
    if (!wraps.includes(open)) wraps.push(open)
    return wraps.indexOf(open)
  }
  const walk = (owner, nodes, heads) => {
    for (const n of nodes) {
      if (n.body === undefined || !n.head || n.head.startsWith('@page') || /^@media\s+print\b/.test(n.head)) continue
      const wrap = wrapOf(heads)
      if (n.head.startsWith('@font-face') || /^@(?:-\w+-)?(property|counter-style)\b/.test(n.head)) { always.push(add(owner, wrap, n.head, n.body)); continue }
      const anim = /^@(?:-\w+-)?keyframes\s+(\S+)/.exec(n.head)
      if (anim) { frames.set(anim[1], [...(frames.get(anim[1]) ?? []), add(owner, wrap, n.head, n.body)]); continue }
      if (GROUPING.test(n.head)) { walk(owner, parse(n.body), [...heads, n.head]); continue }
      if (/\[data-weft=["']?styled/.test(n.head)) continue // the style gate's reveal: only ever in the late sheet
      const need = split(n.head, ',').map(s => (keep.some(k => s.includes(k)) ? { all: [], any: [] } : needs(s))).filter(Boolean)
      if (!need.length) continue
      const open = need.some(k => !k.all.length && !k.any.length)
      const decls = n.body.includes('{') ? [n.body] : split(n.body, ';').filter(d => d.trim())
      const named = decls.filter(d => d.trim().startsWith('--'))
      if (open && named.length && !n.body.includes('{')) {
        const rest = decls.filter(d => !d.trim().startsWith('--'))
        if (rest.length) always.push(add(owner, wrap, n.head, rest.join(';')))
        for (const d of named) add(owner, wrap, n.head, d, d.slice(0, d.indexOf(':')).trim())
      } else {
        const id = add(owner, wrap, n.head, n.body)
        if (open) always.push(id)
        else alts[id] = need
      }
    }
  }
  sheets.forEach(([, css], i) => walk(i, parse(css), []))
  const deps = reading.map(({ read, anim }) => {
    const out = new Set()
    for (const t of read) tokens.get(t)?.forEach(i => out.add(i))
    if (anim) for (const [name, ids] of frames) if (anim.includes(name)) ids.forEach(i => out.add(i))
    return [...out]
  })
  const index = {}
  const weight = k => (/^[.#[]/.test(k) ? count.get(k) ?? 0 : 1e9) // a tag is everywhere
  alts.forEach((need, id) => {
    if (!need) return
    for (const { all: a, any } of need) {
      const groups = [...a.map(k => [k]), ...any]
      const best = groups.reduce((x, y) => (Math.max(...y.map(weight)) < Math.max(...x.map(weight)) ? y : x))
      for (const k of best) { const l = (index[k] ??= []); if (l.at(-1) !== id) l.push(id) }
    }
  })
  for (const [name, ids] of tokens) (index[name] ??= []).push(...ids)
  const layers = []
  for (const [, css] of sheets) for (const n of layerOrder(css)) if (!layers.includes(n)) layers.push(n)
  return { names: sheets.map(s => s[0]), layers: layers.length ? `@layer ${layers.join(',')};` : '', wraps, pieces: list, always, alts: alts.map(a => a && a.map(x => [x.all, x.any])), deps, index }
}
