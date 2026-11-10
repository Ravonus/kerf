// ScrollRail's `below`: the rail starts at the sticky header's bottom edge wherever that edge is, so it never runs
// through the header (a banner above it that scrolls away moves the edge; so does a header that wraps on a narrow page).
import { render } from '@weft-js/core/test'
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

test('without `below` the rail keeps --warp-scroll-rail-top', () => {
  const { container } = render(() => <ScrollRail />)
  expect(
    container.querySelector<HTMLElement>('[data-scope="scroll-rail"]')!.style.insetBlockStart,
  ).toBe('')
})
