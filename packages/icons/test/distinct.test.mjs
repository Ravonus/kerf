// @vitest-environment node
// Hollow and solid, and the three tiers, must look different: judged on rendered pixels at 16 and 24 px. This covers the style
// study until the study reaches the set; then it covers every icon.
import { measure, summary } from '../scripts/distinct.mjs'
import { CSS, STUDY, forms } from '../scripts/study.mjs'

test('every form and tier of the study paints clearly differently', async () => {
  const items = STUDY.map(name => { const f = forms(name); return { name, cells: Object.fromEntries(['quiet', 'balanced', 'vivid'].flatMap(t => ['hollow', 'solid'].map(v => [`${t} ${v}`, f[t][v]]))) } })
  const results = await measure(items, CSS)
  expect(results.filter(r => !r.ok).map(r => r.name), summary(results)).toEqual([])
}, 120000)
