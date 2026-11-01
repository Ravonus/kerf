import { place, slider, type SliderOptions } from '../src/index'

function make(o: Partial<SliderOptions>, dir = 'ltr') {
  const el = document.createElement('div')
  el.dir = dir
  el.style.direction = dir
  el.innerHTML = '<div data-part="track"></div><div data-part="thumb" tabindex="0"></div>'
  document.body.append(el)
  el.querySelector('[data-part="track"]')!.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect
  const seen: number[][] = []
  const a = slider(el, { values: [0], min: 0, max: 100, step: 1, format: String, onChange: v => seen.push(v), ...o })
  const key = (k: string) => el.querySelector('[data-part="thumb"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  return { el, seen, key, a }
}

test('End stops on the last step that fits, never past max', () => {
  const s = make({ max: 10, step: 4 })
  s.key('End')
  expect(s.seen.at(-1)).toEqual([8])
  s.key('ArrowRight')
  expect(s.seen.at(-1)).toEqual([8])
})

test('a fractional step lands on clean numbers', () => {
  const s = make({ max: 1, step: 0.1 })
  for (let i = 0; i < 3; i++) s.key('ArrowRight')
  expect(s.seen.at(-1)).toEqual([0.3])
})

test('a min off the step grid keeps its offset', () => {
  const s = make({ values: [1], min: 1, max: 2, step: 0.25 })
  s.key('End')
  expect(s.seen.at(-1)).toEqual([2])
})

test('in RTL a press 10% from the left edge is 90% along the slider', () => {
  const s = make({ values: [50] }, 'rtl')
  s.el.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, bubbles: true, cancelable: true }))
  expect(s.seen.at(-1)).toEqual([90])
})

test('a form reset goes back to the first value through onChange', async () => {
  const form = document.createElement('form')
  const s = make({ values: [20] })
  form.append(s.el)
  document.body.append(form)
  s.key('End')
  form.reset()
  await new Promise(r => setTimeout(r))
  expect(s.seen.at(-1)).toEqual([20])
  expect(s.el.querySelector('[data-part="thumb"]')!.getAttribute('aria-valuenow')).toBe('20')
})

test('a cancelled form reset changes nothing', async () => {
  const form = document.createElement('form')
  const s = make({ values: [20] })
  form.append(s.el)
  document.body.append(form)
  form.addEventListener('reset', e => e.preventDefault())
  s.key('End')
  form.reset()
  await new Promise(r => setTimeout(r))
  expect(s.seen.at(-1)).toEqual([100])
})

test('place() measures the laid-out size, not a panel still scaled in', () => {
  const el = document.createElement('div')
  const t = document.createElement('button')
  document.body.append(el, t)
  t.getBoundingClientRect = () => ({ left: 500, right: 600, top: 100, bottom: 130, width: 100, height: 30 }) as DOMRect
  el.getBoundingClientRect = () => ({ width: 190, height: 95 }) as DOMRect // 0.95 of the box
  Object.defineProperty(el, 'offsetWidth', { value: 200 })
  Object.defineProperty(el, 'offsetHeight', { value: 100 })
  place(el, t, 'bottom', 'end', 6)
  expect(el.style.left).toBe('400px')
})
