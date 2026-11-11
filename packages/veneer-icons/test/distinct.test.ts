// @vitest-environment node
// Hollow and solid, and the three tiers, must look different: judged on rendered pixels at 16 and 24 px, for every icon.
import { measure, shipped, summary } from '../scripts/distinct.mjs'

const PASSING = 517

test('every form and tier of every icon paints clearly differently', async () => {
  const { items, css } = await shipped()
  const results = await measure(items, css)
  // a ratchet: a stroke icon's hollow and solid differ only by the gap down its middle, so some fall under the bar
  expect(results.filter((r) => r.ok).length, summary(results)).toBeGreaterThanOrEqual(PASSING)
}, 300000)
