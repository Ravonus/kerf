// The logo files, drawn by scripts/mark.mjs from the hero's own geometry and palette. They are committed:
// run `node scripts/logo.mjs` from site/ after changing the mark, and test/logo.test.mjs checks they are current.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { INKS, markCells, markPaths, png } from './mark.mjs'

const site = join(import.meta.dirname, '..')
const GROUND = [11, 18, 13, 255]

const svg = (size, cells, ground) => {
  const back = ground
    ? `<rect width="${size}" height="${size}" rx="${Math.round(size / 6)}" fill="#0b120d"/>`
    : ''
  const paths = markPaths(cells, size)
    .map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${back}${paths}</svg>\n`
}

/** A square PNG on the dark ground, each cell `zoom` pixels. */
const tile = (size, cells, zoom) =>
  png(size * zoom, size * zoom, (x, y) => cells[((y / zoom) | 0) * size + ((x / zoom) | 0)], [
    GROUND,
    ...INKS.slice(1),
  ])

/** The header's mark as a component: the cells written out as JSX, so the page draws it with no work at all. */
const component = (size, cells) => {
  const paths = markPaths(cells, size)
    .map(([fill, d]) => `      <path fill="${fill}" d="${d}" />`)
    .join('\n')
  return `/** The house mark as the hero weaves it, one cell a pixel. Drawn by scripts/logo.mjs. */
export function Mark() {
  return (
    <svg
      data-site="mark"
      viewBox="0 0 ${size} ${size}"
      width="${size}"
      height="${size}"
      shape-rendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
${paths}
    </svg>
  )
}
`
}

/** Every file, by path under site/. */
export function outputs() {
  const big = markCells(72, 3, 4)
  const icon = markCells(32, 1.2, 2, { dither: 0.5, fibre: 0.2, step: 2 })
  const header = markCells(24, 1, 1, { dither: 0.8 })
  return {
    'public/logo.svg': svg(72, big, false),
    'public/favicon.svg': svg(32, icon, true),
    'public/favicon-32.png': tile(32, icon, 1),
    'public/apple-touch-icon.png': tile(36, markCells(36, 1.5, 2), 5),
    'src/components/Mark.gen.tsx': component(24, header),
  }
}

if (import.meta.main) {
  for (const [path, body] of Object.entries(outputs())) writeFileSync(join(site, path), body)
}

/** The files whose committed bytes differ from what the mark draws now. */
export const stale = () =>
  Object.entries(outputs()).filter(([path, body]) => {
    try {
      return !Buffer.from(body).equals(readFileSync(join(site, path)))
    } catch {
      return true
    }
  })
