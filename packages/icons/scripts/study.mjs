// Style study: three tiers by two forms, built for the sheet and the distinctness check. Nothing here reaches the exports yet.
//   quiet     thin line, restrained: a small notch, no shading. Solid is a flat mass with a fine cut.
//   balanced  heavy line, notch and weft plain to see, some dither depth on the shadow side. Solid is lit: dither breaks up
//             the light side, and it throws an offset shade.
//   vivid     pixels on the 16 grid, shaded with dither.
// An open mark has no body to fill, so solid is a notched badge with the mark cut out at quiet and balanced, and a chunky
// block at vivid. Dither is how these two forms get depth, not a third form.
import MASTERS from '../art/style/grids.mjs'
import SOLID, { FILL } from '../art/style/solid.mjs'
import { load } from './build.mjs'
import { cells, outline } from './draw.mjs'
import { interior, rasterize } from './raster.mjs'
import { auto, block, crescent, litCells, master, open, solid, vivid } from './style.mjs'

const icons = await load()
export const STUDY = ['bell', 'trash', 'folder', 'file', 'mail', 'heart', 'star', 'home', 'search', 'user', 'calendar', 'check-circle', 'cloud', 'shield', 'camera', 'chat', 'lock', 'rocket',
  'arrow-right', 'down', 'x', 'plus', 'check', 'menu']
export const PROCEDURAL = ['coins', 'keyboard', 'truck', 'umbrella', 'briefcase', 'flask', 'headphones', 'store', 'bus', 'fish', 'lamp', 'wallet']
export const allNames = Object.keys(icons)

const path = (grid, attr) => { const d = cells(grid).ink; return d ? `<path ${attr} d="${d}"/>` : '' }
const only = (g, ...want) => g.map(r => r.map(c => (want.includes(c) ? '#' : '.')))
const pixels = g => path(only(g, '#'), 'data-p=""') + path(only(g, 'w'), 'data-p="" data-pw=""')
const BADGE = { quiet: 'circ 7 7 6.5', balanced: 'pg 0.5,0.5 13.5,0.5 13.5,13.5 0.5,13.5' }

export function forms(name) {
  const entry = icons[name], spec = entry[0], g = MASTERS[name] ? master(MASTERS[name]) : auto(spec), isOpen = open(g)
  const q = outline(spec, 'quiet'), b = outline(spec, 'balanced')
  const mark = isOpen ? (q.weft || q.body) : q.weft, markB = isOpen ? (b.weft || b.body) : b.weft
  const stroke = (d, a) => (d ? `<path ${a} d="${d}"/>` : '')
  // a mark inside the body is cut out of a solid; a mark outside it, like a handle or a clapper, stays ink
  const [bodySpec = '', weftSpec = ''] = spec.split('/'), inner = interior(rasterize(bodySpec).grid)
  const inside = c => rasterize(`/ ${c}`).weft.flatMap((r, y) => r.flatMap((v, x) => (v === '#' ? [inner[y]?.[x]] : []))).some(Boolean)
  const parts = weftSpec.split(';').filter(c => c.trim())
  const marks = (tier, cut) => parts.filter(c => inside(c) === cut).map(c => outline(`/ ${c}`, tier).weft).join('')
  const fine = auto(spec) // depth cells come from the outline's own landing, so they stay inside the line
  const fill = tier => (FILL[name] ? stroke(outline(FILL[name], tier).body, 'data-s=""') : '')
  const hi = SOLID[name] ? outline(SOLID[name], 'balanced').body : ''
  if (isOpen) {
    const qb = outline(BADGE.quiet, 'quiet').body, bb = outline(BADGE.balanced, 'balanced').body
    return {
      quiet: { hollow: stroke(mark, 'data-qs=""'), solid: stroke(qb, 'data-s=""') + stroke(mark, 'data-k="" data-qs=""') },
      balanced: { hollow: stroke(markB, 'data-bw=""'), solid: stroke(bb, 'data-so="" transform="translate(1 1)"') + stroke(bb, 'data-s=""') + stroke(markB, 'data-k=""') + path(litCells(0), 'data-c=""') },
      vivid: { hollow: pixels(vivid(g, true)), solid: pixels(block(g)) },
    }
  }
  return {
    quiet: {
      hollow: stroke(q.body, 'data-qs=""') + stroke(q.weft, 'data-qs=""'),
      solid: fill('quiet') + stroke(q.body, 'data-s=""') + stroke(marks('quiet', false), 'data-qs=""') + stroke(marks('quiet', true), 'data-k="" data-qs=""'),
    },
    balanced: {
      hollow: stroke(b.body, 'data-bs=""') + stroke(b.weft, parts.length > 3 ? 'data-bs=""' : 'data-bw=""') + path(crescent(fine), 'data-p=""'),
      solid: stroke(b.body, 'data-so="" transform="translate(1.5 1.5)"') + fill('balanced') + stroke(b.body, 'data-s="" data-sh=""') + stroke(marks('balanced', false), 'data-bw=""') + stroke(marks('balanced', true), 'data-k=""') + stroke(hi, 'data-k="" data-hi=""') + path(litCells(fine), 'data-c=""'),
    },
    vivid: { hollow: pixels(vivid(g)), solid: pixels(solid(g)) },
  }
}

export const CSS = `
svg[data-icon] { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; }
[data-qs] { stroke-width: 1; }
[data-bs] { stroke-width: 2; }
[data-bw] { stroke-width: 2.5; stroke: var(--weft, currentColor); }
[data-p], [data-c] { stroke: none; transform: scale(1.5); shape-rendering: crispEdges; }
[data-p] { fill: currentColor; }
[data-pw] { fill: var(--weft, currentColor); }
[data-c] { fill: var(--knock); }
[data-s] { fill: currentColor; stroke: none; }
[data-sh] { stroke: currentColor; stroke-width: 1.5; }
[data-so] { fill: currentColor; fill-opacity: .3; stroke: none; }
[data-k] { stroke: var(--knock); stroke-width: 2.5; }
[data-k][data-qs] { stroke-width: 1.25; }
[data-hi] { stroke-width: 1.25; }
@media (forced-colors: active) { [data-so] { display: none; } }
`
