// The first-paint CSS of whatever HTML is passed in, by lookups: the build's `pieces` table, nothing parsed here. It reads
// the HTML rather than a list kept while rendering, so a cached or prerendered page, a static level and a streamed chunk
// take one path, nothing is shared between requests, and the same HTML always gets the same CSS.
import { markup } from '@weft-js/core/markup'

export interface Pieces {
  names: string[]; layers: string; wraps: string[]; pieces: [number, number, string, string][]
  always: number[]; alts: ([string[], string[][]][] | null)[]; deps: number[][]; index: Record<string, number[]>
}

const GATE = '[data-weft=styled]{visibility:hidden;animation:weft-gate 0s 3s forwards}@keyframes weft-gate{to{visibility:visible}}'
const depth = (open: string) => open.split('{').length - 1

/**
 * One response's tracker: each call gives the CSS `html` needs that this response hasn't sent, from `sheets` alone, so
 * another route's rules never reach this page. `extra`: what the page's head sets, in `markup`'s words.
 */
export function firstPaint(table: Pieces, sheets: string[], head = '') {
  const rank = new Map(sheets.map((name, i) => [table.names.indexOf(name), i]))
  const sent = new Set<number>()
  const headHas = markup('')
  for (const [, name, value] of head.matchAll(/dataset\.(\w+)\s*=\s*['"]([^'"]+)['"]/g)) headHas.add(`[data-${name}=${value}]`)
  let gated = false
  return (html: string) => {
    const has = markup(html)
    for (const k of headHas) has.add(k)
    const fresh: number[] = []
    const take = (id: number) => {
      if (sent.has(id) || !rank.has(table.pieces[id]![0])) return
      sent.add(id)
      fresh.push(id)
      table.deps[id]!.forEach(take)
    }
    table.always.forEach(take)
    for (const key of has) table.index[key]?.forEach(id => {
      const need = table.alts[id]
      if (!need || need.some(([all, any]) => all.every(k => has.has(k)) && any.every(l => l.some(k => has.has(k))))) take(id)
    })
    let css = !gated && has.has('[data-weft=styled]') ? ((gated = true), GATE) : ''
    fresh.sort((a, b) => rank.get(table.pieces[a]![0])! - rank.get(table.pieces[b]![0])! || a - b)
    let open = 0, rule = ''
    for (const id of fresh) {
      const [, wrap, selector, body] = table.pieces[id]!
      if (wrap !== open) {
        css += (rule && '}') + '}'.repeat(depth(table.wraps[open]!)) + table.wraps[wrap]
        open = wrap
        rule = ''
      }
      if (selector === rule && selector[0] !== '@') css += `;${body}` // a token block: one head, however many of its tokens are in
      else {
        css += `${rule && '}'}${selector}{${body}`
        rule = selector
      }
    }
    return css + (rule && '}') + '}'.repeat(depth(table.wraps[open]!))
  }
}
