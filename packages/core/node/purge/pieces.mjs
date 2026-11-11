export function makePieces(sheets, keep, { parse, split, needs, layerOrder, GROUPING }) {
  const wraps = [''],
    list = [],
    alts = [],
    reading = [],
    tokens = new Map(),
    frames = new Map(),
    always = []
  const count = frequencies(sheets)
  const add = (owner, wrap, head, body, name) => {
    const id = list.length,
      text = `${head}{${body}}`
    list.push([owner, wrap, head, body])
    alts.push(null)
    const read = new Set(text.replace(/(?<=[{;])\s*--[\w-]+\s*:/g, ':').match(/--[\w-]+/g) ?? [])
    reading.push({ read, anim: /animation/.test(text) ? text : '' })
    if (name) tokens.set(name, [...(tokens.get(name) ?? []), id])
    return id
  }
  const walk = (owner, nodes, heads) => {
    for (const n of nodes) {
      if (
        n.body === undefined ||
        !n.head ||
        n.head.startsWith('@page') ||
        /^@media\s+print\b/.test(n.head)
      )
        continue
      const wrap = wrapOf(wraps, heads)
      if (
        n.head.startsWith('@font-face') ||
        /^@(?:-\w+-)?(property|counter-style)\b/.test(n.head)
      ) {
        always.push(add(owner, wrap, n.head, n.body))
        continue
      }
      const anim = /^@(?:-\w+-)?keyframes\s+(\S+)/.exec(n.head)
      if (anim) {
        frames.set(anim[1], [...(frames.get(anim[1]) ?? []), add(owner, wrap, n.head, n.body)])
        continue
      }
      if (GROUPING.test(n.head)) {
        walk(owner, parse(n.body), [...heads, n.head])
        continue
      }
      if (/\[data-kerf=["']?styled/.test(n.head)) continue // the style gate's reveal: only ever in the late sheet
      const need = split(n.head, ',')
        .map((s) => (keep.some((k) => s.includes(k)) ? { all: [], any: [] } : needs(s)))
        .filter(Boolean)
      if (!need.length) continue
      const open = need.some((k) => !k.all.length && !k.any.length)
      const decls = n.body.includes('{') ? [n.body] : split(n.body, ';').filter((d) => d.trim())
      const named = decls.filter((d) => d.trim().startsWith('--'))
      if (open && named.length && !n.body.includes('{')) {
        const rest = decls.filter((d) => !d.trim().startsWith('--'))
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
  return finishPieces({
    sheets,
    wraps,
    list,
    alts,
    reading,
    tokens,
    frames,
    always,
    count,
    layerOrder,
  })
}

function finishPieces({
  sheets,
  wraps,
  list,
  alts,
  reading,
  tokens,
  frames,
  always,
  count,
  layerOrder,
}) {
  const deps = reading.map(({ read, anim }) => {
    const out = new Set()
    for (const t of read) tokens.get(t)?.forEach((i) => out.add(i))
    if (anim)
      for (const [name, ids] of frames) if (anim.includes(name)) ids.forEach((i) => out.add(i))
    return [...out]
  })
  const index = {}
  const weight = (k) => (/^[.#[]/.test(k) ? (count.get(k) ?? 0) : 1e9) // a tag is everywhere
  alts.forEach((need, id) => {
    if (!need) return
    for (const { all: a, any } of need) {
      const groups = [...a.map((k) => [k]), ...any]
      const best = groups.reduce((x, y) =>
        Math.max(...y.map(weight)) < Math.max(...x.map(weight)) ? y : x,
      )
      for (const k of best) {
        const l = (index[k] ??= [])
        if (l.at(-1) !== id) l.push(id)
      }
    }
  })
  for (const [name, ids] of tokens) (index[name] ??= []).push(...ids)
  const layers = []
  for (const [, css] of sheets)
    for (const n of layerOrder(css)) if (!layers.includes(n)) layers.push(n)
  return {
    names: sheets.map((s) => s[0]),
    layers: layers.length ? `@layer ${layers.join(',')};` : '',
    wraps,
    pieces: list,
    always,
    alts: alts.map((a) => a && a.map((x) => [x.all, x.any])),
    deps,
    index,
  }
}

function frequencies(sheets) {
  const count = new Map()
  const all = sheets.map((s) => s[1]).join('')
  for (const m of all.matchAll(/\[[\w:-]+(?:=["']?[^\]"']*["']?)?\]|[.#][A-Za-z_][\w-]*/g)) {
    const k = m[0].replace(/["']/g, '')
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  return count
}

function wrapOf(wraps, heads) {
  const open = heads.map((h) => `${h}{`).join('')
  if (!wraps.includes(open)) wraps.push(open)
  return wraps.indexOf(open)
}
