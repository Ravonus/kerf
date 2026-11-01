// @vitest-environment node
// Hollow and solid, and the three tiers, must look different: judged on rendered pixels at 16 and 24 px, for every icon.
import { measure, shipped, summary } from '../scripts/distinct.mjs'

test('every form and tier of every icon paints clearly differently', async () => {
  const { items, css } = await shipped()
  const results = await measure(items, css)
  expect(results.filter(r => !r.ok).map(r => r.name), summary(results)).toEqual([])
}, 300000)
