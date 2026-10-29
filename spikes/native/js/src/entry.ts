// Device entry: the host injects `__weftHost` (apply + log) and timers before evaluating this bundle.
import { App, seedProducts, type Api } from './app'
import { dispatch, mount, type Host } from './runtime'

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

;(globalThis as unknown as { __weft: unknown }).__weft = { dispatch }
mount(__weftHost, () => App({ api }))
__weftHost.log('mounted')
