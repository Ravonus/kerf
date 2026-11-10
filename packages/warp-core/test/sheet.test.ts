// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { sheet } from '../src/sheet'

function make(tall: number) {
  const el = document.createElement('dialog')
  el.dataset.side = 'bottom'
  const handle = document.createElement('button')
  handle.dataset.part = 'handle'
  el.append(handle)
  document.body.append(el)
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => tall })
  return { el, handle }
}

describe('sheet', () => {
  it('opens at half when the content is taller than half the window', () => {
    const { el } = make(innerHeight)
    sheet(el, { open: true, onClose() {} })
    expect(el.dataset.detent).toBe('half')
    expect(el.style.getPropertyValue('--_sheet-h')).toBe('50dvh')
  })
  it('has no stops for short content', () => {
    const { el } = make(40)
    sheet(el, { open: true, onClose() {} })
    expect(el.dataset.detent).toBeUndefined()
  })
  it('a press on the handle steps between stops, and the arrows do too', () => {
    const { el, handle } = make(innerHeight)
    const heard = vi.fn()
    sheet(el, { open: true, onClose() {}, onDetent: heard })
    handle.click()
    expect(el.dataset.detent).toBe('full')
    expect(handle.getAttribute('aria-label')).toMatch(/tall/)
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(el.dataset.detent).toBe('half')
    expect(heard).toHaveBeenLastCalledWith('half')
  })
  it('leaves a side sheet alone', () => {
    const { el } = make(innerHeight)
    el.dataset.side = 'right'
    sheet(el, { open: true, onClose() {} })
    expect(el.dataset.detent).toBeUndefined()
  })
})
