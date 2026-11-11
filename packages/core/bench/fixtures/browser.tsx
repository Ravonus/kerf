// The counter plus every @kerf-js/core/browser export: what an app pays for @kerf-js/core/browser over `counter`.
import { derived, state } from '@kerf-js/core'
import { render } from '@kerf-js/core/dom'
import { interval, lifecycle, media, on, online, visible } from '@kerf-js/core/browser'

function Counter() {
  const count = state(0)
  const double = derived(() => count.value * 2)
  const up = online(),
    shown = visible(),
    page = lifecycle(),
    dark = media('(prefers-color-scheme: dark)', { ssr: false })
  on(window, 'keydown', (e) => {
    if (e.key === '+') count.value++
  })
  interval('1s', () => count.value++)
  return (
    <button onClick={() => count.value++}>
      {count.value} × 2 = {double.value} {up.value ? 'online' : 'offline'}{' '}
      {shown.value ? page.value : 'hidden'} {dark.value ? 'dark' : 'light'}
    </button>
  )
}

render(() => <Counter />, document.getElementById('root')!)
