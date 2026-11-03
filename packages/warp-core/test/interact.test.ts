// @vitest-environment jsdom
// Research 45: real events into anything with a `.value`.
import { interact } from '../src/interact'

const flags = () => ({ hover: { value: false }, focus: { value: false }, pressed: { value: false } })
const el = () => document.body.appendChild(document.createElement('button'))
const pointer = (type: string, pointerType = 'mouse') => { const e = new Event(type, { bubbles: true }); Object.assign(e, { pointerType }); return e }

test('hover follows a mouse and ignores touch', () => {
  const ui = flags(), b = el(), a = interact(b, ui)
  b.dispatchEvent(pointer('pointerenter', 'touch'))
  expect(ui.hover.value).toBe(false)
  b.dispatchEvent(pointer('pointerenter'))
  expect(ui.hover.value).toBe(true)
  b.dispatchEvent(pointer('pointerleave'))
  expect(ui.hover.value).toBe(false)
  a.destroy()
})

test('one row on two elements falls only when the last lets go', () => {
  const ui = flags(), x = el(), y = el(), a = interact(x, ui), b = interact(y, ui)
  x.dispatchEvent(pointer('pointerenter'))
  y.dispatchEvent(pointer('pointerenter'))
  x.dispatchEvent(pointer('pointerleave'))
  expect(ui.hover.value).toBe(true)
  y.dispatchEvent(pointer('pointerleave'))
  expect(ui.hover.value).toBe(false)
  a.destroy()
  b.destroy()
})

test('destroy lets go: no pointerleave comes for a removed element', () => {
  const ui = flags(), b = el(), a = interact(b, ui)
  b.dispatchEvent(pointer('pointerenter'))
  b.dispatchEvent(pointer('pointerdown'))
  b.remove()
  a.destroy()
  expect(ui).toEqual(flags())
})

test('a press ends off the element, and when the page goes away', () => {
  const ui = flags(), b = el(), a = interact(b, ui)
  b.dispatchEvent(pointer('pointerdown'))
  expect(ui.pressed.value).toBe(true)
  window.dispatchEvent(pointer('pointerup'))
  expect(ui.pressed.value).toBe(false)
  b.dispatchEvent(pointer('pointerenter'))
  window.dispatchEvent(new Event('pagehide'))
  expect(ui.hover.value).toBe(false)
  a.destroy()
})

test('Space and Enter press, and letting go lets go', () => {
  const btn = document.createElement('button')
  document.body.append(btn)
  const ui = { hover: { value: false }, focus: { value: false }, pressed: { value: false } }
  const a = interact(btn, ui)
  btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
  expect(ui.pressed.value).toBe(true)
  btn.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }))
  expect(ui.pressed.value).toBe(false)
  a.destroy()
  btn.remove()
})
