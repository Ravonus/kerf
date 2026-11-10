// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}
import { afterEach, expect, it, vi } from 'vitest'
import type { ClientRoutes } from '../src/run'
import { routeClicks } from '../src/run/admission'

const routes: ClientRoutes = { table: [{ id: '/next', pattern: '/next', layouts: [] }], load: {} }

function pointer(type: string, options: MouseEventInit = {}, kind = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...options })
  Object.defineProperties(event, {
    pointerId: { value: 7 },
    isPrimary: { value: true },
    pointerType: { value: kind },
  })
  return event
}

function setup(html = '<a href="/next"><span>go</span></a>') {
  history.replaceState(null, '', '/from')
  document.body.innerHTML = html
  const go = vi.fn()
  const warm = vi.fn()
  const dispose = routeClicks(document, routes, go, warm)
  return { anchor: document.querySelector('a')!, go, warm, dispose }
}

afterEach(() => {
  document.body.innerHTML = ''
  history.replaceState(null, '', '/from')
})

it('a press only warms the route; the click navigates, for every pointer', () => {
  const { anchor, go, warm, dispose } = setup()
  try {
    for (const kind of ['mouse', 'touch', 'pen']) {
      go.mockClear()
      anchor.querySelector('span')!.dispatchEvent(pointer('pointerdown', {}, kind))
      // the page does not change while the button is down: the click has to land on the link
      expect(go).not.toHaveBeenCalled()
      expect(warm).toHaveBeenLastCalledWith(new URL('/next', location.href))
      const click = pointer('click', { detail: 1 }, kind)
      anchor.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(true)
      expect(go).toHaveBeenCalledOnce()
    }
  } finally {
    dispose()
  }
})

it("the link's own click handlers run first and see the click", () => {
  const { anchor, go, dispose } = setup()
  const heard = vi.fn()
  anchor.addEventListener('click', heard)
  try {
    anchor.dispatchEvent(pointer('pointerdown'))
    anchor.dispatchEvent(pointer('click', { detail: 1 }))
    expect(heard).toHaveBeenCalledOnce()
    expect(go).toHaveBeenCalledOnce()
  } finally {
    dispose()
  }
})

it('leaves excluded links to the browser and admits keyboard clicks', () => {
  const { anchor, go, warm, dispose } = setup('<a href="/next">go</a>')
  try {
    for (const [name, value] of [
      ['data-navigation', 'off'],
      ['target', '_blank'],
      ['download', ''],
      ['rel', 'EXTERNAL'],
    ] as const) {
      anchor.setAttribute(name, value)
      anchor.dispatchEvent(pointer('pointerdown'))
      anchor.dispatchEvent(pointer('click', { detail: 1 }))
      anchor.removeAttribute(name)
    }
    anchor.dispatchEvent(pointer('click', { detail: 1, ctrlKey: true }))
    anchor.setAttribute('href', '/unknown')
    anchor.dispatchEvent(pointer('click', { detail: 1 }))
    expect(go).not.toHaveBeenCalled()
    expect(warm).not.toHaveBeenCalled()
    anchor.setAttribute('href', '/next')
    const keyboard = pointer('click', { detail: 0 })
    anchor.dispatchEvent(keyboard)
    expect(keyboard.defaultPrevented).toBe(true)
    expect(go).toHaveBeenCalledOnce()
  } finally {
    dispose()
  }
})

it('a click its own handler prevented is left alone', () => {
  const { anchor, go, dispose } = setup()
  anchor.addEventListener('click', (e) => e.preventDefault())
  try {
    anchor.dispatchEvent(pointer('click', { detail: 1 }))
    expect(go).not.toHaveBeenCalled()
  } finally {
    dispose()
  }
})
