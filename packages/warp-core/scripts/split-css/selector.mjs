// Just enough of a CSS selector parser for the part fence (parts.mjs): selector lists, complex selectors, compounds
// and their simple selectors, with source offsets so a fence can be spliced in place.

/** Parse a selector list into complex selectors: [{ items: [compound | combinator] }]. */
export function parseList(text, base = 0) {
  const list = []
  let from = 0,
    depth = 0,
    quote = null,
    bracket = 0
  for (let i = 0; i <= text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === '[') bracket++
    else if (c === ']') bracket--
    else if ((c === ',' && depth === 0 && bracket === 0) || i === text.length) {
      list.push(parseComplex(text.slice(from, i), base + from))
      from = i + 1
    }
  }
  return list
}

function parseComplex(text, base) {
  const items = []
  let i = 0
  const ws = () => {
    let saw = false
    while (i < text.length && /\s/.test(text[i])) {
      i++
      saw = true
    }
    return saw
  }
  ws()
  while (i < text.length) {
    const c = parseCompound(text, i, base)
    items.push(c)
    i = c.end - base
    const space = ws()
    if (i >= text.length) break
    if ('>+~'.includes(text[i])) {
      items.push({ kind: 'comb', value: text[i] })
      i++
      ws()
    } else if (space) items.push({ kind: 'comb', value: ' ' })
  }
  return { items, start: base, end: base + text.length }
}

function parseCompound(text, i, base) {
  const simples = []
  const start = i
  while (i < text.length && !/[\s>+~]/.test(text[i])) {
    const s = i
    if (text[i] === '[') {
      let quote = null
      for (i++; i < text.length; i++) {
        const c = text[i]
        if (quote) {
          if (c === '\\') i++
          else if (c === quote) quote = null
        } else if (c === '"' || c === "'") quote = c
        else if (c === ']') break
      }
      i++
      const m = text.slice(s, i).match(/^\[([\w-]+)(?:[~|^$*]?=\s*"?([^"\]]*)"?)?/)
      simples.push({
        kind: 'attr',
        name: m?.[1],
        value: m?.[2] ?? null,
        start: base + s,
        end: base + i,
      })
    } else if (text[i] === ':') {
      i++
      const double = text[i] === ':'
      if (double) i++
      const name = text.slice(i).match(/^[\w-]*/)[0]
      i += name.length
      let args = null,
        raw = null
      if (text[i] === '(') {
        let depth = 0,
          quote = null
        const open = i
        for (; i < text.length; i++) {
          const c = text[i]
          if (quote) {
            if (c === '\\') i++
            else if (c === quote) quote = null
          } else if (c === '"' || c === "'") quote = c
          else if (c === '(') depth++
          else if (c === ')' && --depth === 0) break
        }
        raw = text.slice(open + 1, i)
        i++
        if (/^(where|is|not|has|matches)$/.test(name)) args = parseList(raw, base + open + 1)
      }
      simples.push({ kind: 'pseudo', name, double, args, raw, start: base + s, end: base + i })
    } else {
      i++
      while (i < text.length && !/[\s>+~[:.#]/.test(text[i])) i++
      simples.push({ kind: 'other', text: text.slice(s, i), start: base + s, end: base + i })
    }
  }
  return { kind: 'compound', simples, start: base + start, end: base + i }
}
