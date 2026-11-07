import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientRoutes } from '../src/run'
import { routeClicks } from '../src/run/admission'

const routes: ClientRoutes = { table: [{ id: '/next', pattern: '/next', layouts: [] }], load: {} }

function pointer(type: string, options: MouseEventInit = {}, id = 7) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...options })
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: true } })
  return event
}

afterEach(() => { document.body.innerHTML = ''; history.replaceState(null, '', '/from') })

describe('navigation pointer admission', () => {
  it('accepts pointerdown once and suppresses the matching click after anchor removal', () => {
    history.replaceState(null, '', '/from')
    document.body.innerHTML = '<a href="/next"><span>go</span></a>'
    const anchor = document.querySelector('a')!
    const go = vi.fn()
    const dispose = routeClicks(document, routes, go)
    try {
      anchor.querySelector('span')!.dispatchEvent(pointer('pointerdown'))
      expect(go).toHaveBeenCalledOnce()
      expect(go).toHaveBeenCalledWith(new URL('/next', location.href).href)
      anchor.remove()
      const click = pointer('click', { detail: 1 })
      document.documentElement.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(true)
      expect(go).toHaveBeenCalledOnce()
    } finally { dispose() }
  })

  it('preserves excluded links and admits keyboard clicks independently', () => {
    document.body.innerHTML = '<a href="/next">go</a>'
    const anchor = document.querySelector('a')!
    const go = vi.fn()
    const dispose = routeClicks(document, routes, go)
    try {
      anchor.dispatchEvent(pointer('pointerdown', { ctrlKey: true }))
      expect(go).not.toHaveBeenCalled()
      anchor.setAttribute('data-navigation', 'off')
      anchor.dispatchEvent(pointer('pointerdown'))
      expect(go).not.toHaveBeenCalled()
      anchor.removeAttribute('data-navigation')
      anchor.setAttribute('target', '_blank')
      anchor.dispatchEvent(pointer('pointerdown'))
      expect(go).not.toHaveBeenCalled()
      anchor.removeAttribute('target')
      anchor.setAttribute('download', '')
      anchor.dispatchEvent(pointer('pointerdown'))
      anchor.removeAttribute('download')
      anchor.setAttribute('rel', 'EXTERNAL')
      anchor.dispatchEvent(pointer('pointerdown'))
      anchor.removeAttribute('rel')
      expect(go).not.toHaveBeenCalled()
      anchor.setAttribute('href', '/unknown')
      anchor.dispatchEvent(pointer('pointerdown'))
      expect(go).not.toHaveBeenCalled()
      anchor.setAttribute('href', '/next')
      const keyboard = pointer('click', { detail: 0 })
      anchor.dispatchEvent(keyboard)
      expect(keyboard.defaultPrevented).toBe(true)
      expect(go).toHaveBeenCalledOnce()
    } finally { dispose() }
  })

  it('does not consume a later independent modified gesture after a drag', () => {
    document.body.innerHTML = '<a href="/next">go</a>'
    const anchor = document.querySelector('a')!
    const go = vi.fn()
    const dispose = routeClicks(document, routes, go)
    try {
      anchor.dispatchEvent(pointer('pointerdown'))
      anchor.dispatchEvent(pointer('pointerdown', { ctrlKey: true }))
      const click = pointer('click', { detail: 1, ctrlKey: true })
      anchor.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(false)
      expect(go).toHaveBeenCalledOnce()
    } finally { dispose() }
  })

  it('clears a completed gesture before a later independent click', async () => {
    document.body.innerHTML = '<a href="/next">go</a><a href="/unknown">other</a>'
    const [anchor, other] = [...document.querySelectorAll('a')]
    const go = vi.fn(async () => {})
    const dispose = routeClicks(document, routes, go)
    try {
      anchor!.dispatchEvent(pointer('pointerdown'))
      await Promise.resolve()
      const click = pointer('click', { detail: 1 })
      other!.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(false)
      expect(go).toHaveBeenCalledOnce()
    } finally { dispose() }
  })

  it('clears pointer cancellation and honors prevented pointerdown', () => {
    document.body.innerHTML = '<a href="/next">go</a>'
    const anchor = document.querySelector('a')!
    const go = vi.fn()
    const dispose = routeClicks(document, routes, go)
    try {
      const prevent = (event: Event) => event.preventDefault()
      anchor.addEventListener('pointerdown', prevent, { once: true })
      anchor.dispatchEvent(pointer('pointerdown'))
      expect(go).not.toHaveBeenCalled()
      anchor.dispatchEvent(pointer('pointerdown'))
      anchor.dispatchEvent(pointer('pointercancel'))
      const click = pointer('click', { detail: 1 })
      anchor.dispatchEvent(click)
      expect(go).toHaveBeenCalledTimes(2)
    } finally { dispose() }
  })
})
