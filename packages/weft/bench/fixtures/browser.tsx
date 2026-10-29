// The counter plus every weft/browser export: what an app pays for weft/browser over `counter`.
import { derived, state } from 'weft'
import { render } from 'weft/dom'
import { interval, lifecycle, media, on, online, visible } from 'weft/browser'

function Counter() {
  const count = state(0)
  const double = derived(() => count.value * 2)
  const up = online(), shown = visible(), page = lifecycle(), dark = media('(prefers-color-scheme: dark)', { ssr: false })
  on(window, 'keydown', e => { if (e.key === '+') count.value++ })
  interval('1s', () => count.value++)
  return (
    <button onClick={() => count.value++}>
      {count.value} × 2 = {double.value} {up.value ? 'online' : 'offline'} {shown.value ? page.value : 'hidden'} {dark.value ? 'dark' : 'light'}
    </button>
  )
}

render(() => <Counter />, document.getElementById('root')!)
