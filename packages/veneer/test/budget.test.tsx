// Each component's work budget (PLAN §3.7 discipline): after mount, one interaction (fixtures/interactions.ts) may
// cost at most its budget of DOM mutations and reactive re-runs, and must show its result.
import { flush, render, touches } from '@kerf/core/test'
import * as C from './fixtures/Cases'
import { cases } from './fixtures/interactions'

test.each(Object.keys(cases).filter((n) => !n.endsWith('$shape')) as (keyof typeof C)[])(
  '%s',
  async (name) => {
    const c = cases[name]
    const { container } = render((C as Record<string, () => unknown>)[name]!)
    await flush()
    const t = await touches(async () => {
      await c.act(container)
      await flush()
    })
    process.env.MEASURE &&
      process.stderr.write(`MEASURE ${name} ${t.mutations} ${t.runs} ${JSON.stringify(t)}\n`)
    c.see(container)
    expect(t.mutations, `${name}: ${JSON.stringify(t)}`).toBeLessThanOrEqual(c.budget)
    expect(t.runs, `${name}: ${JSON.stringify(t)}`).toBeLessThanOrEqual(c.runs)
  },
)
