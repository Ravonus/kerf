// The logo files: the hero's cut K, smooth, from scripts/mark.mjs and the hero's own geometry. They are committed:
// run `node scripts/logo.mjs` from site/ after changing the mark, and test/logo.test.mjs checks they are current.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILLS, piecePaths, smoothPng } from './mark.mjs'

const site = join(import.meta.dirname, '..')
const GROUND = [11, 18, 13]

const paths = () =>
  piecePaths()
    .map((d, k) => `<path fill="${FILLS[k]}" d="${d}"/>`)
    .join('')

/** The mark alone, or on the dark ground with rounded corners (the favicon), in the 24-unit box. */
const svg = (ground) => {
  const back = ground ? '<rect x="0" y="0" width="24" height="24" rx="5" fill="#0b120d"/>' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${back}${paths()}</svg>\n`
}

/** The header's mark as a component: two paths, so the page draws it with no work at all. */
const component = () => `/** The house mark: the hero's K, cut in two. Drawn by scripts/logo.mjs. */
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
${piecePaths()
  .map((d, k) => `      <path fill="${FILLS[k]}" d="${d}" />`)
  .join('\n')}
    </svg>
  )
}
`

/** Every file, by path under site/. */
export function outputs() {
  return {
    'public/logo.svg': svg(false),
    'public/favicon.svg': svg(true),
    'public/favicon-32.png': smoothPng(32, { fill: 0.8, ground: GROUND }),
    'public/apple-touch-icon.png': smoothPng(180, { fill: 0.7, ground: GROUND }),
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
