// Drops the CSS a build can't reach, as Tailwind does: warp's rules are keyed on data-* values, so a rule whose
// `[data-scope="knob"]` appears nowhere in the built JS or HTML can never match. Then the custom properties and
// keyframes nothing refers to any more go too. It only ever looks for a value as a word in the output, so a name the
// app builds at run time from parts needs `keep`.

// Attributes components set from fixed names. Dials (data-theme, data-density...) are left alone: an app sets those at
// run time, and their rules only hold tokens.
const KEYED = /\[data-(?:scope|part|variant|tone|emphasis)=["']?([^\]"']+)["']?\]/g
const OWNED_PROP = /^--(?:warp-|_)/

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
  return true
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
    const kept = split(n.head, ',').filter(s => reachable(s, has))
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

const ANIMATED = /^@(?:-\w+-)?keyframes\b/

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
  for (;;) {
    const seen = reads(out)
    const next = out.map(css => dropProps(css, name => seen.has(name) || has(name)))
    if (next.join('') === out.join('')) break
    out = next
  }
  const rest = out.map(css => print(parse(css).filter(n => !ANIMATED.test(n.head)))).join('')
  return out.map(css => dropKeyframes(css, rest, has))
}
