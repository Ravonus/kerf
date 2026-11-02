// The core in plain DOM, no framework: the sweep's helpers, the label anatomy, roving focus, the dials.
import { DIALS, getDial, setDial } from '../src/dial'
import { labelChars } from '../src/floating-label'
import { nextIndex, roving } from '../src/focus'
import { installSweep } from '../src/sweep'

afterEach(() => { installSweep().destroy(); document.body.replaceChildren(); document.documentElement.removeAttribute('data-expression') })

const html = (s: string) => { document.body.innerHTML = s; return document.body.firstElementChild as HTMLElement }

test('sweep: pin holds a host, and confirm holds it for one pass', async () => {
  const b = html('<button data-sweep style="--warp-sweep-duration: 10ms">Go</button>')
  const m = installSweep()
  m.pin(b, true)
  expect(b.hasAttribute('data-pin')).toBe(true)
  m.pin(b, false)
  expect(b.hasAttribute('data-pin')).toBe(false)
  m.confirm(b)
  expect(b.hasAttribute('data-confirm')).toBe(true)
  await new Promise(r => { setTimeout(r, 30) })
  expect(b.hasAttribute('data-confirm')).toBe(false)
})

test('sweep: duration reads the token, in s or ms', () => {
  const b = html('<button data-sweep style="--warp-sweep-duration: .5s">Go</button>')
  expect(installSweep().duration(b)).toBe(500)
  b.style.setProperty('--warp-sweep-duration', '300ms')
  expect(installSweep().duration(b)).toBe(300)
})

test('labelChars: grapheme clusters stay whole, whitespace collapses', () => {
  expect(labelChars('  Full  name ')).toEqual('Full name'.split(''))
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
  a!.focus()
  a!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  expect(document.activeElement).toBe(c)
  expect(moved).toEqual([1])
  r.destroy()
  c!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  expect(document.activeElement).toBe(c)
})

test('dials: written on <html>, auto removes the attribute, bad values throw, changes are announced', () => {
  const seen: string[] = []
  document.addEventListener('warp:dial', (e: Event) => seen.push(`${(e as CustomEvent).detail.name}=${(e as CustomEvent).detail.value}`))
  expect(getDial('expression')).toBe(DIALS.expression.initial)
  setDial('expression', 'vivid')
  expect(document.documentElement.dataset.expression).toBe('vivid')
  setDial('theme', 'dark')
  setDial('theme', 'auto')
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(() => setDial('expression', 'loud' as 'quiet')).toThrow(RangeError)
  expect(seen).toEqual(['expression=vivid', 'theme=dark', 'theme=auto'])
})
