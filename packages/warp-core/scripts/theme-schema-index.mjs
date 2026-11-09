// Index raw token-reading declarations while preserving their original CSS context.
import { createHash } from 'node:crypto'
import { consumers } from './theme-schema-consumers.mjs'

function boundary(text, start) {
  let quote = '',
    parens = 0,
    brackets = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) throw new Error('unterminated CSS comment')
      i = end + 1
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === '(') parens++
    if (c === ')') parens--
    if (c === '[') brackets++
    if (c === ']') brackets--
    if (!parens && !brackets && (c === '{' || c === '}' || c === ';')) return i
  }
  return text.length
}

function skip(text, start) {
  let i = start
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++
      continue
    }
    if (!text.startsWith('/*', i)) break
    const end = text.indexOf('*/', i + 2)
    if (end < 0) throw new Error('unterminated CSS comment')
    i = end + 2
  }
  return i
}

export function sourceIndex(source, text) {
  const sites = [],
    counts = new Map()
  function indexRules(start, atRules, selectors) {
    let i = start
    while ((i = skip(text, i)) < text.length) {
      if (text[i] === '}') return i + 1
      const end = boundary(text, i)
      const kind = text[end]
      const raw = text.slice(i, end)
      if (kind === '{') {
        const head = raw.trim()
        i = indexRules(
          end + 1,
          head.startsWith('@') ? [...atRules, head] : atRules,
          head.startsWith('@') ? selectors : [...selectors, head],
        )
      } else {
        const match = /^([\w-]+)\s*:\s*([\s\S]*)$/.exec(raw)
        if (match) {
          const clean = match[2].replace(/\/\*[\s\S]*?\*\//g, '')
          const reads = [
            ...new Set([...clean.matchAll(/var\(\s*(--[\w-]+)/g)].map((item) => item[1])),
          ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
          if (reads.some((name) => name.startsWith('--warp-') || name.startsWith('--_'))) {
            const fallback = match[2].trim()
            const offset = i + raw.indexOf(match[2]) + match[2].indexOf(fallback)
            const key = JSON.stringify([source, atRules, selectors, match[1]])
            const occurrence = counts.get(key) ?? 0
            counts.set(key, occurrence + 1)
            const id = createHash('sha256').update(`${key}:${occurrence}`).digest('hex')
            const simple = selectors.at(-1)?.match(/^:where\(\[data-scope="([\w-]+)"\]\)$/)
            const owner = simple ? { kind: 'scope', name: simple[1] } : { kind: 'unresolved' }
            sites.push({
              id,
              source,
              atRules,
              selectors,
              owner,
              property: match[1],
              occurrence,
              fallback,
              fallbackSpan: [offset, offset + fallback.length],
              reads,
              classification: 'unresolved',
              reason: 'Styled ownership and token role are not yet classified.',
            })
          }
        }
        i = end + 1
        if (kind === '}') return i
      }
    }
    return i
  }
  indexRules(0, [], [])
  return sites
}

export function reconcile(source, text, sites) {
  const relevant = (reads) =>
    reads.some((name) => name.startsWith('--warp-') || name.startsWith('--_'))
  const ast = consumers(source, text).filter((row) => relevant(row.reads))
  const key = (row) =>
    `${row.property.replace(/^-webkit-backdrop-filter$/, 'backdrop-filter')}:${row.reads.join(',')}`
  const raw = sites.map(key)
  const missing = []
  for (const row of ast) {
    const id = raw.indexOf(key(row))
    if (id < 0) missing.push(key(row))
    else raw.splice(id, 1)
  }
  return { astCount: ast.length, indexedCount: sites.length, astOnly: missing, sourceOnly: raw }
}
