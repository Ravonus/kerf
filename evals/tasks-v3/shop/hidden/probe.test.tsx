// Not graded: measures the work each interaction costs in the agent's final app.
// weft-allow T001: measurement probe, not graded; it writes numbers to a file instead of asserting
import { screen } from '@testing-library/dom'
import { writeFileSync } from 'node:fs'
import { flush, stats } from '#adapter'
import { start, type Product } from './helpers'

const cats = ['fruit', 'bakery', 'dairy'] as const
const many: Product[] = Array.from({ length: 150 }, (_, i) => ({
  id: `p${i}`, name: `Item ${String(i).padStart(3, '0')}`, category: cats[i % 3], price: 1 + (i % 17) / 4, stock: 50,
}))

test('probe', async () => {
  const { user, fake } = await start(many)
  const out: Record<string, unknown> = {}
  const measure = async (label: string, fn: () => Promise<void>) => {
    let delivered = 0
    const obs = new MutationObserver(records => { delivered += records.length })
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
    const before = { commits: stats.commits, ms: stats.ms }
    const t0 = performance.now()
    await fn()
    await flush()
    const pending = obs.takeRecords().length
    obs.disconnect()
    out[label] = {
      domMutations: delivered + pending,
      commits: stats.commits === null ? null : stats.commits - (before.commits ?? 0),
      renderMs: stats.commits === null ? null : +(stats.ms - before.ms).toFixed(2),
      wallMs: +(performance.now() - t0).toFixed(2),
    }
  }
  await measure('add-one', () => user.click(screen.getByRole('button', { name: 'Add Item 007' })))
  await measure('price-push', () => fake.push('p100', 99))
  const box = screen.queryByLabelText('Search')
  if (box) await measure('type-3-chars', () => user.type(box, '012'))
  writeFileSync(process.env.PROBE_OUT ?? 'probe.json', JSON.stringify(out, null, 2))
})
