# Browser values (`@weft-js/core/browser`)

```tsx
import { state } from '@weft-js/core'
import {
  online, visible, lifecycle, media, on, interval,
} from '@weft-js/core/browser'

export function Toolbar() {
  const isOnline = online() // Derived<boolean>; server: true
  const shown = visible() // Derived<boolean>; server: true
  // 'active' | 'passive' | 'hidden' | 'frozen' | 'terminated'
  const page = lifecycle()
  // Server renders `ssr`.
  const dark = media('(prefers-color-scheme: dark)', { ssr: false })
  const open = state(true)
  const now = state(Date.now())
  on(window, 'keydown', e => { // e: KeyboardEvent
    if (e.key === 'Escape') open.value = false
  })
  // Also '500ms', '5m', '1h', or a number of ms.
  interval('1s', () => { now.value = Date.now() })
  return (
    <p hidden={!open.value}>
      {isOnline.value ? 'online' : 'offline'}{', '}
      {dark.value ? 'dark' : 'light'}{', '}
      {shown.value ? page.value : 'hidden'},
      {new Date(now.value).toLocaleTimeString()}
    </p>
  )
}
```

- Call them in setup (a component body, a `defineState` setup, or `createRoot`). Their owner removes them; created
  anywhere else (module scope, a timer, a handler, after `await`) they throw in dev and are **W051**.
- Values subscribe on first read and share one listener per event, however many components read them.
- On the server a value is its `ssr` value (`online`/`visible`: `true`, `lifecycle`: `'active'`). `media` has no
  default: pass `ssr` in server-rendered components (**W054**). Hydration renders the server value, then the real one.
- Not `window.addEventListener` / `setInterval` in components (**W050**, with an edit to `on` / `interval`), and not
  `watch(() => live.value, v => { s.value = v })` (**W056**): read `live.value` where you need it.
- `tabs.channel('cart', schema)` is a validated `BroadcastChannel` between tabs: `.post(msg)`, `.on(fn)`, `.value`.
  `state(init, { persist: 'local', sync: 'tabs' })` in a `defineState` keeps a box the same in every tab (S008 without
  `persist`, or with `session`).

In tests (`@weft-js/core/test`): `await net.offline()`, `net.online()`, `page.hide()`, `page.show()`, `page.blur()`,
`page.focus()`, `page.freeze()`, `page.resume()`, `page.leave({ persisted })`, `page.restore()`,
`page.media(query, true)`, `tabs.post(name, msg)`, `tabs.posted(name)`. Each test starts online, visible and focused with every query false. After each test
@weft-js/core/test fails if anything is still open (**T012**); `leaks()` lists it.
