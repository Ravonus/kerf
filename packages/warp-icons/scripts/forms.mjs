// The two forms, hollow and solid, in the three tiers. Every icon has its own drawing in each, so no form is another with a
// fill switched on.
//   quiet     thin line, restrained, no shading. Solid is a flat mass with a fine cut.
//   balanced  heavy line, weft plain to see, dither depth on the shadow side. Solid is lit: dither breaks up the light
//             side, and it throws an offset shade.
//   vivid     pixels on the 16 grid, shaded with dither, and the one tier with the notch.
// Hollow and solid are about the object, never a frame round it. An icon with a body (a cart, a file) is that body drawn
// round or filled. An open mark (an arrow, a check) is its strokes thickened into a shape: hollow draws round the shape,
// solid fills it. Light is always top left.
import MASTERS from '../art/style/masters.mjs'
import SOLID, { FILL } from '../art/style/solid.mjs'
import { cells, outline } from './draw.mjs'
import { enclosed, interior, rasterize } from './raster.mjs'
import { isClosed, layout, scale } from './mark.mjs'
import { commands, shut } from './shape.mjs'
import {
  auto,
  crescent,
  fromHand,
  hollow,
  litCells,
  master,
  open,
  slim,
  solid,
  thick,
} from './style.mjs'

const path = (g, attr) => {
  const d = cells(g).ink
  return d ? `<path ${attr} d="${d}"/>` : ''
}
const only = (g, ...want) => g.map((r) => r.map((c) => (want.includes(c) ? '#' : '.')))
const stroke = (d, a) => (d ? `<path ${a} d="${d}"/>` : '')
const pixels = (g, t = 'data-t="v" ') =>
  path(only(g, '#'), `${t}data-p=""`) +
  path(only(g, 'w'), `${t}data-p="" data-w=""`) +
  path(only(g, '+'), `${t}data-p="" data-d=""`)
/** Straight marks: the same pixels as their outline at 16, so the thrown shadow is all that makes them vivid. */
const PLAIN = new Set([
  'align-center',
  'align-left',
  'align-right',
  'divide',
  'door',
  'drag',
  'equals',
  'exclamation',
  'expand',
  'scan',
  'shrink',
  'tornado',
])
const count = (g) => g.flat().filter(Boolean).length

/** The biggest inside a spec part encloses, in cells, with its notch closed. */
function room(part) {
  const inner = enclosed(rasterize(`${part} /`).body),
    seen = inner.map((r) => r.map(() => false))
  let best = 0
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!inner[y][x] || seen[y][x]) continue
      let n = 0
      const stack = [[x, y]]
      while (stack.length) {
        const [a, b] = stack.pop()
        if (!inner[b]?.[a] || seen[b][a]) continue
        seen[b][a] = true
        n++
        stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1])
      }
      best = Math.max(best, n)
    }
  return best
}
const join = (...p) => p.filter((x) => x.trim()).join('; ')
/** An -off icon's slash: one long diagonal. It crosses the body, so it is never part of it. */
const slash = (c) => {
  const [op, ...w] = c.split(/\s+/)
  if (op !== 'ln' || w.length !== 2) return false
  const [[x0, y0], [x1, y1]] = w.map((p) => p.split(',').map(Number))
  return Math.abs(x1 - x0) >= 9 && Math.abs(Math.abs(x1 - x0) - Math.abs(y1 - y0)) < 1
}

/** Body and weft as the forms see them. A body that is all weft, like a play triangle, is still a body. A body that only
 *  closes with some of the weft's lines, like a house's walls under its roof, takes those lines in. */
function parts(spec) {
  const [body = '', weft = ''] = spec.split('/')
  if (!body.trim()) return count(interior(rasterize(weft).grid)) >= 6 ? [weft, ''] : [body, weft]
  const shell = shut(body, weft)
  if (room(shell) >= 6) return [body, weft]
  const lines = commands(weft).filter((c) => !isClosed(c) && !slash(c))
  if (room(join(shell, ...lines)) < 10) return [body, weft]
  // the weft lines the inside needs: without one, it shrinks
  const whole = count(enclosed(rasterize(`${join(shell, ...lines)} /`).body))
  const needed = lines.filter(
    (c) =>
      count(enclosed(rasterize(`${join(shell, ...lines.filter((d) => d !== c))} /`).body)) < whole,
  )
  return [join(body, ...needed), join(...commands(weft).filter((c) => !needed.includes(c)))]
}

/** Does the icon have a body to fill? Its body, notch closed, encloses some inside, or does with an -off icon's slash. */
export function bodied(spec) {
  // all weft (a play triangle, an ampersand): its closed shapes are objects of their own, and its strokes thicken
  if (!spec.split('/')[0].trim()) return false
  const [body, weft] = parts(spec),
    shell = shut(body, weft)
  return room(shell) >= 6 || room(join(shell, ...commands(weft).filter(slash))) >= 10
}

const f = (v) => String(+v.toFixed(2))
/** The gap down a hollow mark under 20 px, in the 24 box: about a screen pixel and a half at 16. */
const SMALL_GAP = 2.1
/** An open mark in one outline tier. Hollow is a line round its thickened strokes: the thick stroke, masked by a thinner
 *  one down its middle, so where strokes meet they meet as one shape. Its closed shapes are outlines. Solid is the thick
 *  stroke itself, and its closed shapes filled. The mask id is the icon's own, so two copies of one icon agree. */
export function mark(name, spec, tier, form, id = `wi-${name}-${tier[0]}`) {
  const [body, weft] = parts(spec),
    t = `data-t="${tier[0]}"`
  const { s, W, w, S } = layout(shut(body, weft), weft, tier)
  const split = (part) => {
    const c = commands(scale(part, s))
    return [c.filter((x) => !isClosed(x)).join('; '), c.filter(isClosed).join('; ')]
  }
  const d = (part) => (part ? outline(`${part} /`, tier).body : '')
  const [bo, bc] = split(shut(body, weft)).map(d),
    [wo, wc] = split(weft).map(d)
  // balanced solid throws the offset shade its bodies do, a step down and right at 30%
  const shade =
    tier === 'balanced'
      ? stroke(bo + wo, `${t} data-sx="" stroke-width="${f(S)}" transform="translate(1.5 1.5)"`) +
        stroke(bc + wc, `${t} data-so="" transform="translate(1.5 1.5)"`)
      : ''
  if (form === 'solid')
    return (
      shade +
      stroke(bo, `${t} stroke-width="${f(S)}"`) +
      stroke(wo, `${t} stroke-width="${f(S)}" data-w=""`) +
      stroke(bc, `${t} data-f="" stroke-width="${f(w)}"`) +
      stroke(wc, `${t} data-f="" stroke-width="${f(w)}" data-w=""`)
    )
  // under 20 px a thin gap closes up and hollow reads as solid, so a second, wider cut joins it there (icons.css)
  const core = W - 2 * w,
    small = Math.min(SMALL_GAP, W - 2.4)
  const wide =
    small > core + 0.05
      ? `<path data-m="" stroke="#000" stroke-width="${f(small)}" d="${bo}${wo}"/>`
      : ''
  const mask =
    bo || wo
      ? `<mask id="${id}" maskUnits="userSpaceOnUse"><path d="M0 0h24v24H0z" fill="#fff" stroke="none"/><path stroke="#000" stroke-width="${f(core)}" d="${bo}${wo}"/>${wide}</mask>`
      : ''
  const m = `stroke-width="${f(W)}" mask="url(#${id})"`
  return (
    mask +
    stroke(bo, `${t} ${m}`) +
    stroke(wo, `${t} ${m} data-w=""`) +
    stroke(bc, `${t} stroke-width="${f(w)}"`) +
    stroke(wc, `${t} stroke-width="${f(w)}" data-w=""`)
  )
}

/** The grid an icon is shaded from: a drawn master, its hand bitmap, or its spec landed on the grid. */
export function grid(name, [spec, art]) {
  const [body, weft] = parts(spec),
    normal = `${body} / ${weft}`
  return MASTERS[name] ? master(MASTERS[name]) : art ? fromHand(art, name) : auto(normal)
}

/** Pixels of the default form: what the art tests read. */
export function hollowGrid(name, entry) {
  const g = grid(name, entry)
  return bodied(entry[0]) ? hollow(g, open(g)) : thick(g, 'hollow')
}

/** The outline tiers of a spec with their own weights, for the moving part of an action icon too. */
const lines = (spec) => {
  const [body, weft] = parts(spec),
    one = (t, s, w) => {
      const o = outline(`${body} / ${weft}`, t)
      return (
        stroke(o.body, `data-t="${t[0]}" ${s}`) + stroke(o.weft, `data-t="${t[0]}" ${w} data-w=""`)
      )
    }
  return one('quiet', 'data-qs=""', 'data-qs=""') + one('balanced', 'data-bs=""', 'data-bi=""')
}

export function forms(name, entry) {
  const spec = entry[0],
    g = grid(name, entry),
    isOpen = !bodied(spec),
    [bodySpec, weftSpec] = parts(spec),
    normal = `${bodySpec} / ${weftSpec}`
  const q = outline(normal, 'quiet'),
    b = outline(normal, 'balanced')
  if (isOpen)
    return {
      hollow: {
        line: mark(name, spec, 'quiet', 'hollow') + mark(name, spec, 'balanced', 'hollow'),
        pixels: pixels(thick(g, 'hollow')),
      },
      solid: {
        line: mark(name, spec, 'quiet', 'solid') + mark(name, spec, 'balanced', 'solid'),
        pixels: pixels(thick(g, 'solid')),
      },
    }
  // a mark inside the body is cut out of a solid; a mark outside it, like a handle or a clapper, stays ink
  const inner = interior(rasterize(shut(bodySpec, weftSpec)).grid),
    split = weftSpec.split(';').filter((c) => c.trim())
  // most of it in the body: a handle that only dips in, like a bag's, stays ink rather than vanish where it leaves
  const inside = (c) => {
    const on = rasterize(`/ ${c}`).weft.flatMap((r, y) =>
      r.flatMap((v, x) => (v === '#' ? [inner[y]?.[x]] : [])),
    )
    return on.filter(Boolean).length >= 0.5 * on.length && on.some(Boolean)
  }
  const marks = (tier, cut) =>
    split
      .filter((c) => inside(c) === cut)
      .map((c) => outline(`/ ${c}`, tier).weft)
      .join('')
  const fine = auto(normal) // depth cells come from the outline's own landing, so they stay inside the line
  const fill = (tier) =>
    FILL[name] ? stroke(outline(FILL[name], tier).body, `data-t="${tier[0]}" data-s=""`) : ''
  const hi = SOLID[name] ? outline(SOLID[name], 'balanced').body : ''
  return {
    hollow: {
      line:
        stroke(q.body, 'data-t="q" data-qs=""') +
        stroke(q.weft, 'data-t="q" data-qs="" data-w=""') +
        stroke(b.body, 'data-t="b" data-bs=""') +
        stroke(b.weft, `data-t="b" data-bi="" data-w=""`) +
        path(crescent(fine), 'data-t="b" data-p="" data-d=""'),
      pixels: pixels(slim(hollow(g, false, PLAIN.has(name) ? '#' : '+'))),
    },
    solid: {
      line:
        fill('quiet') +
        stroke(q.body, 'data-t="q" data-s=""') +
        stroke(marks('quiet', false), 'data-t="q" data-qs="" data-w=""') +
        stroke(marks('quiet', true), 'data-t="q" data-k="" data-qs=""') +
        stroke(b.body, 'data-t="b" data-so="" transform="translate(1.5 1.5)"') +
        fill('balanced') +
        stroke(b.body, 'data-t="b" data-s="" data-sh=""') +
        stroke(marks('balanced', false), 'data-t="b" data-bw="" data-w=""') +
        stroke(marks('balanced', true), 'data-t="b" data-k=""') +
        stroke(hi, 'data-t="b" data-k="" data-hi=""') +
        path(litCells(fine), 'data-t="b" data-c=""'),
      pixels: pixels(solid(g)),
    },
  }
}

/** An action icon: what stays, then the part that moves in a group CSS can take hold of, one for outlines and one for pixels. */
export function acting(name, entry, a) {
  const g = hollowGrid(name, entry),
    drawn = a.moving && rasterize(a.moving).grid
  const moves = a.cells ?? (drawn ? (x, y) => drawn[y][x] === '#' : () => true)
  const pick = (on) => g.map((r, y) => r.map((c, x) => (moves(x, y) === on ? c : '.')))
  // an open mark moves as the object it is, mask and all, under its own id
  const part =
    a.moving || bodied(entry[0])
      ? lines(a.moving ?? entry[0])
      : mark(name, entry[0], 'quiet', 'hollow', `wi-${name}-qa`) +
        mark(name, entry[0], 'balanced', 'hollow', `wi-${name}-ba`)
  return {
    line:
      (a.still ? lines(a.still) : '') +
      `<g data-a="${name}">${a.draw ? part.replaceAll('<path ', '<path pathLength="1" ') : part}</g>`,
    pixels:
      (a.still ? pixels(pick(false)) : '') +
      `<g data-a="${name}" data-t="v">${pixels(pick(true), '')}</g>`,
  }
}
