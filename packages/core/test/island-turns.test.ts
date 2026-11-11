// Islands that load with the page take a task each (island.ts `turn`): hydration's own task claims none of them, they
// run in page order, `settled` resolves once the last has, and an event on one still waiting claims it at once.
// kerf-allow T004, T005: framework test of hydration's tasks; server markup and the order of macrotasks are the subject
import { hydrate, level, settled, wake } from '@kerf-js/core/dom'
import { sleep as tick } from '../../../scripts/lib/sleep.mjs'

type Held = { q: Event[]; d: boolean; p(e: Event): void; w(): void }
const win = window as Window & { __wq?: Held }

afterEach(() => {
  document.body.textContent = ''
  delete win.__wq
})

const island = (id: string) =>
  `<!--wi:["${id}","${id}0",[]]--><!--[--><b wk="${id}0/0">${id}</b><!--]-->`

function page(ids: string[], capture = true) {
  if (capture) win.__wq = { q: [], d: false, p() {}, w() {} }
  document.body.innerHTML = `<div id="app"><!--wl:0:[""]-->${ids.map(island).join('')}<!--/wl:0--></div>`
  const ran: string[] = []
  const load = (id: string) => () => {
    ran.push(id)
    return null
  }
  hydrate(
    () =>
      level(
        '',
        0,
        () => null,
        load,
        undefined,
        () => Promise.resolve(),
      ),
    document.getElementById('app')!,
  )
  return ran
}

test('islands that load with the page each take a task of their own, in page order', async () => {
  const ran = page(['a', 'b', 'c'])
  expect(ran).toEqual([]) // nothing in hydration's task
  await tick()
  expect(ran).toEqual(['a'])
  await settled()
  expect(ran).toEqual(['a', 'b', 'c'])
})

test('an event on an island that has not had its turn claims it at once, and only once', async () => {
  const ran = page(['a', 'b', 'c'])
  wake(document.querySelector('[wk="c0/0"]')!)
  await Promise.resolve()
  await Promise.resolve()
  expect(ran).toEqual(['c'])
  await settled()
  expect(ran).toEqual(['c', 'a', 'b'])
})

test('with no capture script to hold what comes first, they are claimed with the page', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) // the stub islands claim none of their nodes
  const ran = page(['a', 'b'], false)
  warn.mockRestore()
  expect(ran).toEqual(['a', 'b'])
  await settled()
  expect(ran).toEqual(['a', 'b'])
})
