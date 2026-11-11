// ScrollRail's `below`: the rail starts at the sticky header's bottom edge wherever that edge is, so it never runs
// through the header (a banner above it that scrolls away moves the edge; so does a header that wraps on a narrow page).
import { render } from '@kerf/core/test'
import { ScrollRail } from '../src/ScrollRail'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

test('the rail starts at the header named by `below`, and follows it as the page scrolls', async () => {
  const header = document.createElement('header')
  header.className = 'masthead'
  let bottom = 100
  header.getBoundingClientRect = () => ({ bottom }) as DOMRect
  document.body.append(header)
  try {
    const { container } = render(() => <ScrollRail below=".masthead" />)
    const rail = container.querySelector<HTMLElement>('[data-scope="scroll-rail"]')!
    expect(rail.style.insetBlockStart).toBe('100px')
    bottom = 61 // the banner above has scrolled away; the header stuck at the top
    dispatchEvent(new Event('scroll'))
    await new Promise((r) => {
      requestAnimationFrame(() => r(null))
    })
    expect(rail.style.insetBlockStart).toBe('61px')
  } finally {
    header.remove()
  }
})

test('without `below` the rail keeps --veneer-scroll-rail-top', () => {
  const { container } = render(() => <ScrollRail />)
  expect(
    container.querySelector<HTMLElement>('[data-scope="scroll-rail"]')!.style.insetBlockStart,
  ).toBe('')
})

test('a press on the track jumps the thumb to that spot, and the press keeps dragging from there', () => {
  // A 500px track over a page 5000px tall in a 1000px window: an 100px thumb, 400px of travel for 4000px of page.
  const root = document.documentElement
  const height = Object.getOwnPropertyDescriptor(root, 'scrollHeight')
  Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 5000 })
  const inner = innerHeight
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
  const to: number[] = []
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(((o: ScrollToOptions) => {
    to.push(o.top!)
  }) as typeof scrollTo)
  try {
    const { container } = render(() => <ScrollRail />)
    const rail = container.querySelector<HTMLElement>('[data-scope="scroll-rail"]')!
    const thumb = rail.firstElementChild as HTMLElement
    Object.defineProperty(rail, 'clientHeight', { configurable: true, value: 500 })
    rail.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
    thumb.setPointerCapture = () => {}
    const press = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientY: 250,
    })
    rail.dispatchEvent(Object.assign(press, { pointerId: 1 }))
    // the thumb's middle lands at 250px: its top at 200 of 400px of travel, half of the page's 4000px
    expect(to).toEqual([2000])
    expect(press.defaultPrevented).toBe(true)
    expect(rail.hasAttribute('data-dragging')).toBe(true)
    thumb.dispatchEvent(new MouseEvent('pointerup'))
    expect(rail.hasAttribute('data-dragging')).toBe(false)
  } finally {
    scroll.mockRestore()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: inner })
    if (height) Object.defineProperty(root, 'scrollHeight', height)
    else delete (root as { scrollHeight?: number }).scrollHeight
  }
})
