// The core in plain DOM, no framework: the sweep's helpers, the label anatomy, roving focus, the dials.
import { vi } from 'vitest'
import { copyButtons } from '../src/copy'
import { edges } from '../src/indicator'
import { DIALS, getDial, setDial } from '../src/dial'
import { labelChars } from '../src/floating-label'
import { nextIndex, roving } from '../src/focus'
import { installSweep } from '../src/sweep'

afterEach(() => { installSweep().destroy(); document.body.replaceChildren(); document.documentElement.removeAttribute('data-expression') })

const html = (s: string) => { document.body.innerHTML = s; return document.body.firstElementChild as HTMLElement }
const pointer = (type: string, el: Element, init: PointerEventInit = {}) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', ...init }))

test('sweep: pin holds a host, and confirm holds it for one pass', async () => {
  const b = html('<button data-sweep style="--warp-sweep-duration: 10ms">Go</button>')
  const m = installSweep()
  m.pin(b, true)
  expect(b.hasAttribute('data-pin')).toBe(true)
  m.pin(b, false)
  expect(b.hasAttribute('data-pin')).toBe(false)
  m.confirm(b)
  expect(b.hasAttribute('data-confirm')).toBe(true)
  await new Promise(r => setTimeout(r, 30))
  expect(b.hasAttribute('data-confirm')).toBe(false)
})

test('sweep: duration reads the token, in s or ms', () => {
  const b = html('<button data-sweep style="--warp-sweep-duration: .5s">Go</button>')
  expect(installSweep().duration(b)).toBe(500)
  b.style.setProperty('--warp-sweep-duration', '300ms')
  expect(installSweep().duration(b)).toBe(300)
})

test('labelChars: grapheme clusters stay whole, whitespace collapses', () => {
  expect(labelChars('  Full  name ')).toEqual([...'Full name'])
  expect(labelChars('Hi 👩‍💻')).toEqual(['H', 'i', ' ', '👩‍💻'])
})

test('nextIndex: arrows wrap, Home/End jump, RTL flips, vertical uses up/down', () => {
  expect(nextIndex('ArrowRight', 2, 3)).toBe(0)
  expect(nextIndex('ArrowLeft', 0, 3)).toBe(2)
  expect(nextIndex('End', 0, 3)).toBe(2)
  expect(nextIndex('ArrowRight', 0, 3, { rtl: true })).toBe(2)
  expect(nextIndex('ArrowDown', 0, 3, { orientation: 'vertical' })).toBe(1)
  expect(nextIndex('ArrowDown', 0, 3)).toBe(-1)
})

test('roving: one tab stop, arrows move focus and report where it landed, disabled items are skipped', () => {
  const g = html('<div><button>a</button><button disabled>b</button><button>c</button></div>')
  const moved: number[] = []
  const r = roving(g, { items: 'button', onMove: (_, i) => moved.push(i) })
  const [a, , c] = g.querySelectorAll('button')
  a.focus()
  a.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  expect(document.activeElement).toBe(c)
  expect(moved).toEqual([1])
  r.destroy()
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  expect(document.activeElement).toBe(c)
})

test('dials: written on <html>, auto removes the attribute, bad values throw, changes are announced', () => {
  const seen: string[] = []
  document.addEventListener('warp:dial', (e: any) => seen.push(`${e.detail.name}=${e.detail.value}`))
  expect(getDial('expression')).toBe(DIALS.expression.initial)
  setDial('expression', 'vivid')
  expect(document.documentElement.dataset.expression).toBe('vivid')
  setDial('theme', 'dark')
  setDial('theme', 'auto')
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(() => setDial('expression', 'loud' as any)).toThrow(RangeError)
  expect(seen).toEqual(['expression=vivid', 'theme=dark', 'theme=auto'])
})

test('dials: a persisted initial value is kept, so a page whose own default differs keeps it on reload', () => {
  localStorage.removeItem('warp:dials')
  setDial('expression', 'quiet', { persist: true })
  expect(JSON.parse(localStorage.getItem('warp:dials')!)).toEqual({ expression: 'quiet' })
  setDial('expression', 'balanced', { persist: true })
  expect(JSON.parse(localStorage.getItem('warp:dials')!)).toEqual({ expression: 'balanced' })
  setDial('theme', 'dark', { persist: true })
  setDial('theme', 'auto', { persist: true })
  expect(JSON.parse(localStorage.getItem('warp:dials')!)).toEqual({ expression: 'balanced' })
  // the reload: the page's head says vivid, then the kept dials apply over it (dialScript)
  const root = document.createElement('html')
  root.dataset.expression = 'vivid'
  Object.assign(root.dataset, JSON.parse(localStorage.getItem('warp:dials') || '{}'))
  expect(getDial('expression', root)).toBe('balanced')
  localStorage.removeItem('warp:dials')
})

test('copy: a refused clipboard write is caught and shows a failed state', async () => {
  const writeText = vi.fn(async () => { throw new DOMException('Write permission denied.', 'NotAllowedError') })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const unhandled = vi.fn()
  process.on('unhandledRejection', unhandled)
  html('<div data-scope="announcer" aria-live="polite"></div><button data-act="copy" data-copy="" data-copy-text="x"></button>')
  const stop = copyButtons()
  const b = document.querySelector<HTMLElement>('[data-act="copy"]')!
  b.click()
  await new Promise(r => setTimeout(r, 80))
  expect(writeText).toHaveBeenCalledWith('x')
  expect(b.hasAttribute('data-failed')).toBe(true)
  expect(b.hasAttribute('data-done')).toBe(false)
  expect(b.dataset.state).toBe('failed')
  expect(document.querySelector('[data-scope="announcer"]')!.textContent).toMatch(/Couldn’t copy/)
  expect(unhandled).not.toHaveBeenCalled()
  process.off('unhandledRejection', unhandled)
  // no clipboard at all fails the same way, and a later copy that lands clears it
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  b.click()
  await new Promise(r => setTimeout(r, 0))
  expect(b.dataset.state).toBe('failed')
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true })
  b.click()
  await new Promise(r => setTimeout(r, 0))
  expect(b.hasAttribute('data-failed')).toBe(false)
  expect(b.dataset.state).toBe('copied')
  stop()
})

test('copy: a refusal on a page with no announcer still says so, aloud and in words beside the button', async () => {
  vi.useFakeTimers()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError') }) }, configurable: true })
  html('<div data-scope="codeblock"><div data-part="head"><button data-act="copy" data-copy="" aria-label="Copy code"><span data-part="indicator"></span></button></div><code>x</code></div>')
  const stop = copyButtons()
  const b = document.querySelector<HTMLElement>('[data-act="copy"]')!
  b.click()
  await vi.advanceTimersByTimeAsync(80)
  const live = document.querySelector<HTMLElement>('[data-scope="announcer"][aria-live="polite"]')
  expect(live).not.toBeNull()
  expect(live!.getAttribute('role')).toBe('status')
  expect(live!.textContent).toMatch(/Couldn’t copy/)
  const note = b.querySelector<HTMLElement>(':scope > [data-part="copy-note"]')
  expect(note?.textContent).toBe('Couldn’t copy')
  expect(note?.getAttribute('aria-hidden')).toBe('true') // the name stays "Copy code"; the live region speaks
  // a second refusal reuses both: one announcer, one note
  b.click()
  await vi.advanceTimersByTimeAsync(80)
  expect(document.querySelectorAll('[data-scope="announcer"]').length).toBe(1)
  expect(b.querySelectorAll('[data-part="copy-note"]').length).toBe(1)
  // and the note goes with the failed state
  await vi.advanceTimersByTimeAsync(2500)
  expect(b.dataset.state).toBeUndefined()
  expect(b.querySelector('[data-part="copy-note"]')).toBeNull()
  stop()
  vi.useRealTimers()
})

test('copy: a highlighted block keeps its newlines', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  html('<div data-scope="codeblock"><button data-act="copy"></button><code><span data-part="line">one</span><span data-part="line">two</span></code></div>')
  const stop = copyButtons()
  document.querySelector<HTMLElement>('[data-act="copy"]')!.click()
  await Promise.resolve(); await Promise.resolve()
  expect(writeText).toHaveBeenCalledWith('one\ntwo')
  stop()
})

test('edges: the box says which sides of its sideways scroller have more, in rtl too', () => {
  const box = html('<div data-scope="edges"><div id="s"><i></i></div></div>')
  const s = box.querySelector<HTMLElement>('#s')!
  let left = 0
  Object.defineProperty(s, 'scrollWidth', { configurable: true, get: () => 1000 })
  Object.defineProperty(s, 'clientWidth', { configurable: true, get: () => 400 })
  Object.defineProperty(s, 'scrollLeft', { configurable: true, get: () => left })
  const a = edges(s)
  expect(box.dataset.overflow).toBe('end')
  left = 300; s.dispatchEvent(new Event('scroll'))
  expect(box.dataset.overflow).toBe('start end')
  left = 600; s.dispatchEvent(new Event('scroll'))
  expect(box.dataset.overflow).toBe('start')
  left = -600; s.dispatchEvent(new Event('scroll')) // rtl counts down from 0
  expect(box.dataset.overflow).toBe('start')
  left = 0; Object.defineProperty(s, 'scrollWidth', { configurable: true, get: () => 400 })
  a.update()
  expect(box.dataset.overflow).toBeUndefined() // it fits: no shadow
  a.destroy()
})
