// Device entry: the host injects `__weftHost` (apply + log) and timers before evaluating this bundle.
import { App, seedProducts, type Api } from './app'
import { setViewport, type WindowInfo } from './platform'
import { dispatch, mount, type Host } from './runtime'
import type { EventName } from './protocol.gen'

declare const __weftHost: Host & { log(line: string): void }

const seed = seedProducts(150)
const api: Api = {
  listProducts: () => Promise.resolve(JSON.parse(JSON.stringify(seed))),
  subscribePrices(fn) {
    let n = 0
    const t = setInterval(() => {
      const p = seed[(n++ * 37) % seed.length]
      fn({ id: p.id, price: Math.round(p.price * (0.8 + Math.random() * 0.4) * 100) / 100 })
    }, 1000)
    return () => clearInterval(t)
  },
}

// Node 0 is never a real node: the host sends window changes as `dispatch(0, 'viewport', json)` (on start, on
// rotation, unfolding, split screen). The app mounts on the first one, so a wide window never flashes the phone form.
let mounted = false
function onViewport(json: string) {
  setViewport(JSON.parse(json) as WindowInfo)
  if (mounted) return
  mounted = true
  mount(__weftHost, () => App({ api }))
  __weftHost.log(`mounted ${json}`)
}
;(globalThis as unknown as { __weft: unknown }).__weft = {
  dispatch: (id: number, event: string, payload: string) =>
    id === 0 && event === 'viewport'
      ? onViewport(payload)
      : dispatch(id, event as EventName, payload),
}
