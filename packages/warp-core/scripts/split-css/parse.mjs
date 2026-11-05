// Top-level items inside the file's one @layer block: comments, whitespace and balanced rules, in order.
export function items(css) {
  const open = css.search(/@layer [\w.-]+ \{/)
  const start = css.indexOf('{', open) + 1
  const { list, end } = body(css, start)
  return { layer: css.slice(open, start).match(/@layer ([\w.-]+)/)[1], list, end }
}

// Items of a block body from `start` up to its closing brace.
export function body(css, start) {
  const list = []
  let i = start
  while (i < css.length) {
    if (/\s/.test(css[i])) {
      const j = css.slice(i).search(/\S/)
      list.push({ kind: 'space', text: css.slice(i, j < 0 ? css.length : i + j) })
      i += list.at(-1).text.length
      continue
    }
    if (css.startsWith('/*', i)) {
      const j = css.indexOf('*/', i) + 2
      list.push({ kind: 'comment', text: css.slice(i, j) })
      i = j
      continue
    }
    if (css[i] === '}') return { list, end: i }
    let depth = 0,
      j = i,
      quote = null
    for (; j < css.length; j++) {
      const c = css[j]
      if (quote) {
        if (c === '\\') j++
        else if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'") {
        quote = c
        continue
      }
      if (css.startsWith('/*', j)) {
        j = css.indexOf('*/', j) + 1
        continue
      }
      if (c === '{') depth++
      if (c === '}' && --depth === 0) break
    }
    list.push({ kind: 'rule', text: css.slice(i, j + 1) })
    i = j + 1
  }
  throw new Error('unterminated block')
}

// the [data-scope]s a rule styles, plus the two behaviours keyed by a bare attribute ([data-copy], [data-hamburger])
export const scopesOf = (text) => [
  ...new Set(
    [...text.matchAll(/data-scope="([\w-]+)"|\[data-(copy|hamburger)\]/g)].map((m) => m[1] ?? m[2]),
  ),
]
