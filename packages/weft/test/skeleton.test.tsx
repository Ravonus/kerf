// X031 (research 11 §8.5, research 26 §4): in dev, <Boundary> measures its pending fallback and the content at the
// swap and warns when the boxes differ by more than 1 px.
// weft-allow T004, T005: fake timers drive the Boundary's 150 ms / 400 ms timing; the boxes are found by class to mock their layout
import { flush, render } from '@weft-js/core/test'
import { Users, type Load } from './fixtures/ssr/Users'

const load: Load = () => new Promise(ok => setTimeout(() => ok({ name: 'Ada' }), 200))

/** jsdom has no layout: the fallback (`.skeleton`) is `skeleton` px tall, everything else 40 px. */
function layout(skeleton: number) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const h = this.classList.contains('skeleton') ? skeleton : 40
    return { top: 0, left: 0, bottom: h, right: 300, width: 300, height: h, x: 0, y: 0, toJSON() {} }
  })
}

async function swap() {
  render(Users, { load })
  await vi.advanceTimersByTimeAsync(150)
  expect(document.querySelector('.skeleton')).not.toBeNull()
  await vi.advanceTimersByTimeAsync(400)
  await flush()
  expect(document.querySelector('.profile')!.textContent).toBe('Ada')
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

test('a fallback shorter than the content warns X031 with the delta', async () => {
  layout(20)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await swap()
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn.mock.calls[0][0]).toMatch(/X031 <Boundary> pending fallback was 300×20 px, the content is 300×40 px \(Δ 0, 20\)/)
})

test('a fallback the size of the content is quiet (within 1 px)', async () => {
  layout(39.5)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await swap()
  expect(warn).not.toHaveBeenCalled()
})
