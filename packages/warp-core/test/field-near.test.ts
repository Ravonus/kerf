// A field measures its label (per-character delays, the notch) only once it is near the screen: measuring one off
// screen, in a `content-visibility: auto` section say, would make the browser style and lay out that whole section.
import { floatingLabel } from '../src/floating-label'

let seen: ((list: { isIntersecting: boolean }[]) => void) | undefined
class Near {
  constructor(cb: typeof seen) {
    seen = cb
  }
  observe() {}
  disconnect() {
    seen = undefined
  }
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  vi.stubGlobal('IntersectionObserver', Near)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.replaceChildren()
})

test('a field off screen measures nothing until it comes near, then measures once it has', () => {
  document.body.innerHTML = `<div class="panel" style="background-color: rgb(250, 250, 250)"><div data-scope="field" id="f"><div data-part="control"><label data-part="label"><span data-part="label-chars"><span data-char></span></span></label><input data-part="input"></div></div></div>`
  const control = document.querySelector<HTMLElement>('[data-part="control"]')!
  Object.defineProperty(control, 'offsetWidth', { value: 200 })
  const label = document.querySelector<HTMLElement>('[data-part="label"]')!
  const char = document.querySelector<HTMLElement>('[data-char]')!
  const f = floatingLabel(document.getElementById('f')!)
  vi.advanceTimersByTime(100)
  expect(char.style.getPropertyValue('--d')).toBe('')
  expect(label.style.getPropertyValue('--_notch-color')).toBe('')
  f.update() // a programmatic write before then doesn't measure either
  vi.advanceTimersByTime(100)
  expect(char.style.getPropertyValue('--d')).toBe('')
  seen!([{ isIntersecting: false }])
  vi.advanceTimersByTime(100)
  expect(char.style.getPropertyValue('--d')).toBe('')
  seen!([{ isIntersecting: true }])
  expect(seen).toBeUndefined() // it stops watching
  vi.advanceTimersByTime(100)
  expect(char.style.getPropertyValue('--d')).not.toBe('')
  expect(label.style.getPropertyValue('--_notch-color')).toBe('rgb(250, 250, 250)')
  f.destroy()
})
