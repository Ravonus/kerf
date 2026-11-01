// @vitest-environment node
// The set holds to its rules (docs/design/warp/10-icons.md).
import { readFileSync } from 'node:fs'
import { load } from '../scripts/build.mjs'
import { cells, outline } from '../scripts/draw.mjs'
import { grid as  hollowGrid } from '../scripts/forms.mjs'
import { auto, crescent } from '../scripts/style.mjs'
import { names } from '../src/gen/names'

const art = await load()
const entries = Object.entries(art)
const inked = g => g.map(r => r.map(c => (c === 'w' ? '#' : c)))

test('the set is at least 500, with every warp and lemonstand name', () => {
  expect(names.length).toBeGreaterThanOrEqual(500)
  for (const name of ['x', 'check', 'search', 'down', 'alert', 'alert-circle', 'info', 'check-circle', 'calendar', 'clock', 'left', 'right', 'globe', 'timer', 'pin', 'card', 'undo', 'more',
    'arrow-right', 'book-open', 'building', 'eye-off', 'file-check', 'hand-coins', 'hand-helping', 'heart', 'key', 'library', 'line-chart', 'loader', 'menu', 'message-question', 'plus', 'rotate-ccw', 'school', 'send', 'shield-check', 'user-check', 'users']) expect(names, name).toContain(name)
})

test.each(entries)('%s: both outlines draw, and the pixels are 16×16 with ink', (name, entry) => {
  const [spec] = entry
  for (const tier of ['quiet', 'balanced']) {
    const { body, weft } = outline(spec, tier)
    expect(body + weft, name).toMatch(/^M/)
    expect(body + weft, name).not.toMatch(/NaN|undefined/)
  }
  const grid = inked(hollowGrid(name, entry)), { ink } = cells(grid)
  expect(ink).toMatch(/^M/)
  expect(grid).toHaveLength(16)
  expect(grid.flat().filter(c => c === '#').length, name).toBeGreaterThan(5)
})

test('no two icons share a pixel drawing', () => {
  const seen = new Map()
  for (const [name, entry] of entries) {
    const key = cells(inked(hollowGrid(name, entry))).ink
    expect(seen.get(key), `${name} repeats ${seen.get(key)}`).toBeUndefined()
    seen.set(key, name)
  }
})

test('a crescent holds together: no loose cells, and none too small to read as shade', () => {
  for (const [name, [spec]] of entries) {
    const g = crescent(auto(spec)), on = (x, y) => g[y]?.[x] === '#', cells = g.flatMap((r, y) => r.flatMap((c, x) => (c === '#' ? [[x, y]] : [])))
    expect(cells.length === 0 || cells.length >= 6, name).toBe(true)
    for (const [x, y] of cells) expect(on(x - 1, y - 1) || on(x + 1, y - 1) || on(x - 1, y + 1) || on(x + 1, y + 1), name).toBe(true)
  }
})

test('no other icon set is a dependency', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }).join(' ')
  for (const banned of ['lucide', 'heroicons', 'phosphor', 'tabler', 'feather']) expect(deps).not.toContain(banned)
})
