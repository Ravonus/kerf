import { expect, it, vi } from 'vitest'
import { scrollPage } from '../src/page-scroll'
it('announces the target before a smooth click, supports instant and follows reduced motion', () => {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: 9000,
  })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  const calls: string[] = [],
    native = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      calls.push('scroll')
    })
  const listener = (event: Event) => {
    calls.push('intent')
    expect((event as CustomEvent).detail.top).toBe(4500)
  }
  window.addEventListener('kerf:scroll-target', listener)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  scrollPage(4500)
  expect(calls).toEqual(['intent', 'scroll'])
  expect(native).toHaveBeenLastCalledWith({ top: 4500, behavior: 'smooth' })
  scrollPage(4500, 'instant')
  expect(native).toHaveBeenLastCalledWith({ top: 4500, behavior: 'instant' })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  scrollPage(4500)
  expect(native).toHaveBeenLastCalledWith({ top: 4500, behavior: 'instant' })
  window.removeEventListener('kerf:scroll-target', listener)
  native.mockRestore()
  vi.unstubAllGlobals()
})
