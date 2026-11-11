// `frames` from a stop: the run starts where the stop resolves on the page's own section map.
import { frames } from '@weft-js/capture'
import type { Page } from 'playwright-core'

/** A page that answers what `frames` asks: its sections, a scroll, and a recorded run. */
function fakePage(scrolled: number[]) {
  const evaluate = (fn: (arg?: unknown) => unknown, arg?: unknown) => {
    const code = String(fn)
    if (code.includes('querySelectorAll(sel)'))
      return Promise.resolve({
        viewportHeight: 900,
        documentHeight: 4000,
        sections: [
          { index: 0, id: 'hero', top: 0, height: 900 },
          { index: 1, id: 'pay', top: 900, height: 2700 },
        ],
      })
    if (code.includes("behavior: 'instant'") && typeof arg === 'number') {
      scrolled.push(arg)
      return Promise.resolve(arg)
    }
    if (code.includes('weftFrames'))
      return Promise.resolve({ gaps: [16, 17, 16], longTasks: 0, longTaskMs: 0, scrolled: 0 })
    return Promise.resolve(undefined)
  }
  const context = {
    newCDPSession: () => Promise.resolve({ send: () => Promise.resolve() }),
    browser: () => null,
  }
  return {
    evaluate,
    waitForFunction: () => Promise.resolve(),
    context: () => context,
  } as unknown as Page
}

test('a run starts at a stop, resolved on the page, or at px', async () => {
  const scrolled: number[] = []
  const run = await frames(fakePage(scrolled), {
    from: { section: 'pay', at: 0.5 },
    seconds: 0,
    speed: 0,
  })
  expect(run.from).toBe(1800)
  expect(scrolled[0]).toBe(1800)
  const plain = await frames(fakePage(scrolled), { from: 1400, seconds: 0, speed: 0 })
  expect(plain.from).toBe(1400)
})
