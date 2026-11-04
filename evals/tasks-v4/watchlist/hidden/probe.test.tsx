// Not graded: measures the work each interaction costs in the agent's final app (200 rows).
// weft-allow T001: measurement probe, not graded; it writes numbers to a file instead of asserting
import { screen } from '@testing-library/dom'
import { writeFileSync } from 'node:fs'
import { stats } from '#adapter'
import { cost, fakeApi, seed, start } from './helpers'

test('probe', async () => {
  const many = seed(200)
  const { user, fake } = await start(fakeApi(many))
  const out: Record<string, unknown> = {}
  const measure = async (label: string, fn: () => Promise<unknown>) => {
    const before = { commits: stats.commits, ms: stats.ms }
    const t0 = performance.now()
    try {
      const c = await cost(fn)
      out[label] = {
        domMutations: c.dom,
        formatCalls: c.calls,
        commits: stats.commits === null ? null : stats.commits - (before.commits ?? 0),
        wallMs: +(performance.now() - t0).toFixed(2),
      }
    } catch (e) {
      out[label] = { error: String(e).slice(0, 120) }
    }
  }
  await measure('quote', () => fake.push('s120', 12))
  const star = screen.queryByRole('button', { name: `Favorite ${many[101].symbol}` })
  if (star) await measure('star', () => user.click(star))
  const box = screen.queryByLabelText('Search')
  if (box) {
    await user.type(box, 'x')
    await measure('search-narrow', () =>
      fake.searches.at(-1)!.resolve(many.filter((_, i) => i % 10 === 0).map((s) => s.id)),
    )
    await user.clear(box)
  }
  const details = screen.queryByRole('button', { name: `Details ${many[60].symbol}` })
  if (details) {
    await user.click(details)
    const notes = screen.queryByLabelText('Notes')
    if (notes) await measure('type-notes-5', () => user.type(notes, 'hello'))
    await measure('quote-open', () => fake.push('s60', 42))
  }
  writeFileSync(process.env.PROBE_OUT ?? 'probe.json', JSON.stringify(out, null, 2))
})
