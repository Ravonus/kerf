// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}
import { expect, it } from 'vitest'
import { flush, onCleanup, state } from '@kerf-js/core'
import { render } from '@kerf-js/core/dom'
import { createRouteState } from '../src/router'
import { App } from '../src/view'

it('keeps the actual page owner through a pending shape and cancellation', () => {
  let cleanups = 0
  const Page = () => {
    const count = state(0)
    onCleanup(() => {
      cleanups++
    })
    return <button onClick={() => count.value++}>{count.value}</button>
  }
  const Shape = () => <p>pending</p>
  const route = createRouteState(
    { p: '/one', s: 200, m: [{ id: '/one', params: {} }] },
    { '/one': Page },
  )
  const container = document.createElement('div')
  document.body.append(container)
  const dispose = render(() => <App route={route} />, container)
  const button = container.querySelector('button')!
  button.click()
  flush()
  try {
    route.levels[0]!.shape.value = [
      {
        kind: 'generated',
        component: Shape,
        ready: true,
        completeness: 'partial',
        release: () => {},
      },
    ]
    flush()
    expect(container.textContent).toBe('pending')
    expect(cleanups).toBe(0)
    route.levels[0]!.shape.value = undefined
    flush()
    expect(container.querySelector('button')).toBe(button)
    expect(button.textContent).toBe('1')
    expect(cleanups).toBe(0)
  } finally {
    dispose()
    container.remove()
  }
  expect(cleanups).toBe(1)
})
