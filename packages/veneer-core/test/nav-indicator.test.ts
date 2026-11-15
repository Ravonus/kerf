import { navIndicator } from '../src/nav'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

test('one nav indicator follows hover and selection across wrapped rows', () => {
  const frames: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback)
    return frames.length
  })
  const nav = document.createElement('nav')
  const links = ['One', 'Two', 'Three'].map((text, index) => {
    const link = document.createElement('a')
    link.href = `#${index}`
    link.textContent = text
    nav.append(link)
    return link
  })
  links[0]!.setAttribute('aria-current', 'page')
  const face = document.createElement('span')
  face.dataset.part = 'indicator'
  nav.append(face)
  document.body.append(nav)
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect
  nav.getBoundingClientRect = () => rect(20, 10, 180, 60)
  links[0]!.getBoundingClientRect = () => rect(20, 10, 60, 20)
  links[1]!.getBoundingClientRect = () => rect(120, 10, 80, 20)
  links[2]!.getBoundingClientRect = () => rect(20, 50, 70, 20)
  const binding = navIndicator(nav)
  frames.shift()?.(0)
  expect(face.style.transform).toBe('translate(0px, -40px) scaleX(60)')
  links[1]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
  expect(face.style.transform).toBe('translate(100px, -40px) scaleX(80)')
  links[2]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
  expect(face.style.transform).toBe('translate(0px, 0px) scaleX(70)')
  nav.dispatchEvent(new MouseEvent('pointerout', { relatedTarget: document.body, bubbles: true }))
  expect(face.style.transform).toBe('translate(0px, -40px) scaleX(60)')
  links[0]!.removeAttribute('aria-current')
  links[2]!.setAttribute('aria-current', 'page')
  binding.update()
  expect(face.style.transform).toBe('translate(0px, 0px) scaleX(70)')
  expect(nav.querySelectorAll('[data-part="indicator"]')).toHaveLength(1)
  binding.destroy()
  links[1]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
  expect(face.style.transform).toBe('translate(0px, 0px) scaleX(70)')
})
