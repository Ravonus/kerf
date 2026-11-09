// Prune rule tables while preserving the categories read by each engine.
export function createRuleTables({ U, D, names, perMap, inA, alphabet }) {
  // --- rule tables: prune states / categories
  const ruleTables = {}

  // Apple quote overrides read the categories of U+007B and U+007D, which are in every alphabet here.
  for (const t of names) {
    const [catCount, dictStart, laSize, states] = D.ruleTables[t]
    const width = catCount + 3
    const rowsOf = (tt) => {
      const [cc, , , st, b, diff] = D.ruleTables[tt]
      return U.unpackStateRows(cc + 3, st, b === null ? null : rowsOf(b), U.unpackVarints(diff))
    }
    const rows = rowsOf(t)
    const map = perMap[t]
    if (!alphabet) {
      ruleTables[t] = { catCount, dictStart, laSize, rows, width, remapCat: null }
      continue
    }
    const used = new Set([0, 1, 2])
    for (let c = 0; c < 0x110000; c++) if (inA(c)) used.add(map[c])
    const cats = [...used].sort((a, b) => a - b)
    // keep dictionary categories last, so `>= dictStart` still means dictionary
    const plain = cats.filter((c) => c < dictStart),
      dict = cats.filter((c) => c >= dictStart)
    const order = [...plain, ...dict]
    const newCat = new Map(order.map((c, i) => [c, i]))
    for (const c of [0, 1, 2]) if (newCat.get(c) !== c) throw new Error('special categories moved')
    const { nrows, nw, states: count } = minimizeStates(rows, width, order)
    const { mrows, mw, dictStart2, merged, keep } = mergeCategories({
      nrows,
      nw,
      order,
      plain,
      newCat,
      map,
      states: count,
    })
    const S = count
    ruleTables[t] = {
      catCount: keep.length,
      dictStart: dictStart2,
      laSize,
      rows: mrows,
      width: mw,
      states: S,
      oldStates: states,
      oldCats: catCount,
    }
    for (let c = 0; c < 0x110000; c++) map[c] = inA(c) ? merged.get(newCat.get(map[c])) : 0
  }
  return ruleTables
}

function minimizeStates(rows, width, order) {
  // reachable states
  const seen = new Map([
      [0, 0],
      [1, 1],
    ]),
    queue = [1]
  while (queue.length) {
    const s = queue.shift()
    for (const c of order) {
      const nx = rows[s * width + 3 + c]
      if (!seen.has(nx)) {
        seen.set(nx, seen.size)
        queue.push(nx)
      }
    }
  }
  // Moore minimisation over the kept categories. fTagsIdx (cell 2) is never read by the port, so it is
  // zeroed; fAccepting and fLookAhead are slot numbers and must match exactly. STOP stays 0, START 1.
  const olds = [...seen.keys()]
  let block = new Map(
    olds.map((o) => [
      o,
      o === 0 ? 'S' : o === 1 ? 'T' : rows[o * width] + ':' + rows[o * width + 1],
    ]),
  )
  for (;;) {
    const sig = new Map(
      olds.map((o) => [
        o,
        block.get(o) + '|' + order.map((c) => block.get(rows[o * width + 3 + c])).join(','),
      ]),
    )
    const ids = new Map()
    const nb = new Map(
      olds.map((o) => {
        const k = sig.get(o)
        if (!ids.has(k)) ids.set(k, ids.size)
        return [o, 'b' + ids.get(k)]
      }),
    )
    const count = new Set(nb.values()).size,
      prev = new Set(block.values()).size
    block = nb
    if (count === prev) break
  }
  const num = new Map([
    [block.get(0), 0],
    [block.get(1), 1],
  ])
  for (const o of olds) if (!num.has(block.get(o))) num.set(block.get(o), num.size)
  const nw = order.length + 3
  const nrows = new Uint16Array(num.size * nw)
  for (const o of olds) {
    const nu = num.get(block.get(o))
    nrows[nu * nw] = rows[o * width]
    nrows[nu * nw + 1] = rows[o * width + 1]
    nrows[nu * nw + 2] = 0
    order.forEach((c, i) => {
      nrows[nu * nw + 3 + i] = num.get(block.get(rows[o * width + 3 + c]))
    })
  }
  return { nrows, nw, states: num.size }
}

function mergeCategories({ nrows, nw, order, plain, newCat, map, states }) {
  // Merge categories whose columns are identical in every kept state (never 0..2, never across the
  // dictionary boundary). The class map then gives both the same category.
  const S = states,
    colKey = (i) => {
      let k = i >= plain.length ? 'd' : 'p'
      for (let r = 0; r < S; r++) k += ',' + nrows[r * nw + 3 + i]
      return k
    }
  const keep = [],
    merged = new Map()
  for (let i = 0; i < order.length; i++) {
    const k = colKey(i)
    // categories the port reads by value (Gecko's skipped U+00AD, Apple's quote overrides) stay apart
    const isProtected = (q) => [0x7b, 0x7d, 0xad].some((cp) => newCat.get(map[cp]) === q)
    const j =
      i < 3 || isProtected(i)
        ? -1
        : keep.findIndex((q) => q >= 3 && !isProtected(q) && colKey(q) === k)
    if (j >= 0) merged.set(i, j)
    else {
      merged.set(i, keep.length)
      keep.push(i)
    }
  }
  const mw = keep.length + 3,
    mrows = new Uint16Array(S * mw)
  for (let r = 0; r < S; r++) {
    mrows[r * mw] = nrows[r * nw]
    mrows[r * mw + 1] = nrows[r * nw + 1]
    keep.forEach((i, ni) => {
      mrows[r * mw + 3 + ni] = nrows[r * nw + 3 + i]
    })
  }
  const dictStart2 = keep.filter((i) => i < plain.length).length
  return { mrows, mw, dictStart2, merged, keep }
}
