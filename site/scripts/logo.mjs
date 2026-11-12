// The logo files: the hero's cut K with a light Bayer grain, from scripts/mark.mjs and the hero's own geometry. They are committed:
// run `node scripts/logo.mjs` from site/ after changing the mark, and test/logo.test.mjs checks they are current.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILLS, grainPaths, logoPng, piecePaths } from './mark.mjs'

const site = join(import.meta.dirname, '..')
const GROUND = [11, 18, 13]

/** The pieces, then the grain over them, as [fill, d] pairs. */
const layers = (cell) => [
  ...piecePaths().map((d, k) => [FILLS[k], d]),
  ...grainPaths(cell).map(({ fill, d }) => [fill, d]),
]
const paths = (cell) =>
  layers(cell)
    .map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`)
    .join('')

/** The mark alone, or on the dark ground with rounded corners (the favicon), in the 24-unit box. */
const svg = (ground, cell) => {
  const back = ground ? '<rect x="0" y="0" width="24" height="24" rx="5" fill="#0b120d"/>' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${back}${paths(cell)}</svg>\n`
}

/** One path as the formatter lays it out: on one line when it fits in 100 columns, else an attribute a line. */
const tag = (fill, d) => {
  const line = `      <path fill="${fill}" d="${d}" />`
  return line.length <= 100
    ? line
    : `      <path\n        fill="${fill}"\n        d="${d}"\n      />`
}

/** The header's mark as a component: a few static paths, one cell to a pixel at its 24px size. */
const component =
  () => `/** The house mark: the hero's K, cut in two, with a light grain. Drawn by scripts/logo.mjs. */
export function Mark() {
  return (
    <svg
      data-site="mark"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
${layers(1)
  .map(([fill, d]) => tag(fill, d))
  .join('\n')}
    </svg>
  )
}
`

/** Every file, by path under site/. */
export function outputs() {
  return {
    'public/logo.svg': svg(false, 0.75),
    'public/favicon.svg': svg(true, 1),
    'public/favicon-32.png': logoPng(32, {
      fill: 0.8,
      ground: GROUND,
      cell: 1.5,
    }),
    'public/apple-touch-icon.png': logoPng(180, {
      fill: 0.7,
      ground: GROUND,
      cell: 0.75,
    }),
    'src/components/Mark.gen.tsx': component(),
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
