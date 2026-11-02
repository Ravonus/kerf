// The markup warp's CSS expects, and the component API.
import { render } from '@weft-js/core/test'
import { CheckIcon, XIcon, iconSet } from '@weft-js/warp-icons'

test('decorative by default; label names it', () => {
  const { container } = render(() => <div><CheckIcon /><XIcon label="Close" /></div>)
  const [plain, named] = container.querySelectorAll('svg')
  expect(plain.getAttribute('aria-hidden')).toBe('true')
  expect(plain.getAttribute('focusable')).toBe('false')
  expect(plain.hasAttribute('role')).toBe(false)
  expect(named.getAttribute('role')).toBe('img')
  expect(named.getAttribute('aria-label')).toBe('Close')
  expect(named.hasAttribute('aria-hidden')).toBe(false)
})

test('three tiers in one svg, no wrapper: outline and pixel paths are direct children', () => {
  const { container } = render(() => <CheckIcon />)
  const svg = container.querySelector('svg')!
  expect([...svg.children].every(c => c.tagName.toLowerCase() === 'path')).toBe(true)
  const pixels = svg.querySelector('[data-t="v"]')!
  expect(pixels.hasAttribute('data-p')).toBe(true)
  expect(svg.querySelector('[data-w]')).not.toBeNull()
})

test('size sets both axes and keeps a caller style; other attributes pass through', () => {
  const { container } = render(() => <CheckIcon size={32} style="color:red" data-part="icon" />)
  const svg = container.querySelector('svg')!
  expect(svg.style.width).toBe('32px')
  expect(svg.style.color).toBe('red')
  expect(svg.getAttribute('data-part')).toBe('icon')
})

test('iconSet looks a name up in its own list', () => {
  const Icon = iconSet({ yes: CheckIcon, no: XIcon })
  const { container } = render(() => <Icon name="no" label="No" />)
  expect(container.querySelector('svg')!.getAttribute('aria-label')).toBe('No')
})
