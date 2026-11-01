// The two forms, hollow and solid, in the three tiers. Every icon has its own drawing in each, so no form is another with a
// fill switched on.
//   quiet     thin line, restrained: a small notch, no shading. Solid is a flat mass with a fine cut.
//   balanced  heavy line, notch and weft plain to see, dither depth on the shadow side. Solid is lit: dither breaks up the
//             light side, and it throws an offset shade.
//   vivid     pixels on the 16 grid, shaded with dither.
// An open mark has no body to fill, so solid is a notched badge with the mark cut out. Light is always top left.
import MASTERS from '../art/style/masters.mjs'
import SOLID, { FILL } from '../art/style/solid.mjs'
import { cells, outline } from './draw.mjs'
import { interior, rasterize } from './raster.mjs'
import { auto, block, crescent, fromHand, hollow, litCells, master, open, solid } from './style.mjs'

const path = (grid, attr) => { const d = cells(grid).ink; return d ? `<path ${attr} d="${d}"/>` : '' }
const only = (g, ...want) => g.map(r => r.map(c => (want.includes(c) ? '#' : '.')))
const stroke = (d, a) => (d ? `<path ${a} d="${d}"/>` : '')
const pixels = (g, t = 'data-t="v" ') => path(only(g, '#'), `${t}data-p=""`) + path(only(g, 'w'), `${t}data-p="" data-w=""`) + path(only(g, '+'), `${t}data-p="" data-d=""`)
const BADGE = { quiet: 'circ 7 7 6.5', balanced: 'pg 0.5,0.5 13.5,0.5 13.5,13.5 0.5,13.5' }
/** Corner brackets sit on a badge's edge and vanish into it, so in quiet they stay ink, round a small disc. */
const BRACKETS = new Set(['expand', 'scan'])
/** Straight marks: the same pixels as their outline at 16, so the thrown shadow is all that makes them vivid. */
const PLAIN = new Set(['align-center', 'align-left', 'align-right', 'divide', 'door', 'drag', 'equals', 'exclamation', 'expand', 'scan', 'shrink', 'tornado'])
const count = g => g.flat().filter(Boolean).length

/** A body that is all weft, like a play triangle, is still a body. */
function parts(spec) {
  const [body = '', weft = ''] = spec.split('/')
  return !body.trim() && count(interior(rasterize(weft).grid)) >= 6 ? [weft, ''] : [body, weft]
}

/** The grid an icon is shaded from: a drawn master, its hand bitmap, or its spec landed on the grid. */
export function grid(name, [spec, art]) {
  const [body, weft] = parts(spec), normal = `${body} / ${weft}`
  return MASTERS[name] ? master(MASTERS[name]) : art ? fromHand(art, name, normal) : auto(normal)
}

/** Pixels of the default form: what the art tests read. */
export function hollowGrid(name, entry) {
  const g = grid(name, entry)
  return hollow(g, open(g))
}

/** The outline tiers of a spec with their own weights, for the moving part of an action icon too. */
const lines = spec => {
  const [body, weft] = parts(spec), one = (t, s, w) => { const o = outline(`${body} / ${weft}`, t); return stroke(o.body, `data-t="${t[0]}" ${s}`) + stroke(o.weft, `data-t="${t[0]}" ${w} data-w=""`) }
  return one('quiet', 'data-qs=""', 'data-qs=""') + one('balanced', 'data-bs=""', 'data-bw=""')
}

export function forms(name, entry) {
  const spec = entry[0], g = grid(name, entry), isOpen = open(g), [bodySpec, weftSpec] = parts(spec), normal = `${bodySpec} / ${weftSpec}`
  const q = outline(normal, 'quiet'), b = outline(normal, 'balanced')
  if (isOpen) {
    const mq = q.weft + q.body, mb = b.weft + b.body, qb = outline(BADGE.quiet, 'quiet').body, bb = outline(BADGE.balanced, 'balanced').body
    return {
      hollow: { line: stroke(mq, 'data-t="q" data-qs="" data-w=""') + stroke(mb, 'data-t="b" data-bw="" data-w=""'), pixels: pixels(hollow(g, true, PLAIN.has(name) ? '#' : '+')) },
      solid: {
        line: (BRACKETS.has(name) ? stroke(outline('circ 7 7 3.5', 'quiet').body, 'data-t="q" data-s=""') + stroke(mq, 'data-t="q" data-qs="" data-w=""') : stroke(qb, 'data-t="q" data-s=""') + stroke(mq, 'data-t="q" data-k="" data-qs=""'))
          + stroke(bb, 'data-t="b" data-so="" transform="translate(1 1)"') + stroke(bb, 'data-t="b" data-s=""') + stroke(mb, 'data-t="b" data-k=""') + path(litCells(0), 'data-t="b" data-c=""'),
        pixels: pixels(block(g)),
      },
    }
  }
  // a mark inside the body is cut out of a solid; a mark outside it, like a handle or a clapper, stays ink
  const inner = interior(rasterize(bodySpec).grid), split = weftSpec.split(';').filter(c => c.trim())
  const inside = c => rasterize(`/ ${c}`).weft.flatMap((r, y) => r.flatMap((v, x) => (v === '#' ? [inner[y]?.[x]] : []))).some(Boolean)
  const marks = (tier, cut) => split.filter(c => inside(c) === cut).map(c => outline(`/ ${c}`, tier).weft).join('')
  const fine = auto(normal) // depth cells come from the outline's own landing, so they stay inside the line
  const fill = tier => (FILL[name] ? stroke(outline(FILL[name], tier).body, `data-t="${tier[0]}" data-s=""`) : '')
  const hi = SOLID[name] ? outline(SOLID[name], 'balanced').body : ''
  return {
    hollow: {
      line: stroke(q.body, 'data-t="q" data-qs=""') + stroke(q.weft, 'data-t="q" data-qs="" data-w=""')
        + stroke(b.body, 'data-t="b" data-bs=""') + stroke(b.weft, `data-t="b" ${split.length > 3 ? 'data-bs' : 'data-bw'}="" data-w=""`) + path(crescent(fine), 'data-t="b" data-p="" data-d=""'),
      pixels: pixels(hollow(g, false, PLAIN.has(name) ? '#' : '+')),
    },
    solid: {
      line: fill('quiet') + stroke(q.body, 'data-t="q" data-s=""') + stroke(marks('quiet', false), 'data-t="q" data-qs="" data-w=""') + stroke(marks('quiet', true), 'data-t="q" data-k="" data-qs=""')
        + stroke(b.body, 'data-t="b" data-so="" transform="translate(1.5 1.5)"') + fill('balanced') + stroke(b.body, 'data-t="b" data-s="" data-sh=""')
        + stroke(marks('balanced', false), 'data-t="b" data-bw="" data-w=""') + stroke(marks('balanced', true), 'data-t="b" data-k=""') + stroke(hi, 'data-t="b" data-k="" data-hi=""') + path(litCells(fine), 'data-t="b" data-c=""'),
      pixels: pixels(solid(g)),
    },
  }
}

/** An action icon: what stays, then the part that moves in a group CSS can take hold of, one for outlines and one for pixels. */
export function acting(name, entry, a) {
  const g = hollowGrid(name, entry), drawn = a.moving && rasterize(a.moving).grid
  const moves = a.cells ?? (drawn ? (x, y) => drawn[y][x] === '#' : () => true)
  const pick = on => g.map((r, y) => r.map((c, x) => (moves(x, y) === on ? c : '.')))
  const part = lines(a.moving ?? entry[0])
  return {
    line: (a.still ? lines(a.still) : '') + `<g data-a="${name}">${a.draw ? part.replaceAll('<path ', '<path pathLength="1" ') : part}</g>`,
    pixels: (a.still ? pixels(pick(false)) : '') + `<g data-a="${name}" data-t="v">${pixels(pick(true), '')}</g>`,
  }
}
