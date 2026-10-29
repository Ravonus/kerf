// The core in plain DOM, no framework: the sweep phase machine, the label anatomy, roving focus, the dials.
import { DIALS, getDial, setDial } from '../src/dial'
import { labelChars } from '../src/floating-label'
import { nextIndex, roving } from '../src/focus'
import { installSweep } from '../src/sweep'

afterEach(() => { installSweep().destroy(); document.body.replaceChildren(); document.documentElement.removeAttribute('data-expression') })

const html = (s: string) => { document.body.innerHTML = s; return document.body.firstElementChild as HTMLElement }
const pointer = (type: string, el: Element, init: PointerEventInit = {}) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', ...init }))
const ticks = () => new Promise(r => setTimeout(r, 0))

test('sweep: idle on install, in on hover, out then idle on leave (no transition: straight to idle)', async () => {
  const b = html('<button data-sweep><span data-part="sweep-base"></span><span data-part="sweep"></span>Go</button>')
  installSweep()
  expect(b.dataset.phase).toBe('idle')
  pointer('pointerover', b)
  expect(b.dataset.phase).toBe('in')
  pointer('pointerout', b, { relatedTarget: document.body })
  expect(b.dataset.phase).toBe('idle')
})

test('sweep: a held state (aria-expanded) keeps the host in; releasing it lets it go', async () => {
  const b = html('<button data-sweep data-phase="idle" aria-expanded="false">Menu</button>')
  installSweep()
  b.setAttribute('aria-expanded', 'true')
  await ticks()
  expect(b.dataset.phase).toBe('in')
  b.setAttribute('aria-expanded', 'false')
  await ticks()
  expect(b.dataset.phase).toBe('idle')
})

test('sweep: hosts added later are picked up; data-static hosts are never touched', async () => {
  installSweep()
  document.body.innerHTML = '<span data-sweep id="a"></span><span data-sweep data-static data-phase="in" id="b"></span>'
  await ticks()
  expect(document.getElementById('a')!.dataset.phase).toBe('idle')
  pointer('pointerover', document.getElementById('b')!)
  expect(document.getElementById('b')!.dataset.phase).toBe('in')
})

test('sweep: touch pointers never count as hover', () => {
  const b = html('<button data-sweep>Go</button>')
  installSweep()
  pointer('pointerover', b, { pointerType: 'touch' })
  expect(b.dataset.phase).toBe('idle')
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
