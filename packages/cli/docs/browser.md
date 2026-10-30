# Browser values (`weft/browser`)

```tsx
import { online, visible, lifecycle, media, on, interval } from 'weft/browser'

export function Toolbar() {
  const isOnline = online()                                         // Derived<boolean>; server: true
  const page = lifecycle()                                          // 'active' | 'passive' | 'hidden' | 'frozen' | 'terminated'
  const dark = media('(prefers-color-scheme: dark)', { ssr: false }) // server renders `ssr`
  on(window, 'keydown', e => { if (e.key === 'Escape') close() })    // e: KeyboardEvent
  interval('1s', () => { now.value = Date.now() })                  // also '500ms', '5m', or a number of ms
  return <p>{isOnline.value ? 'online' : 'offline'} {dark.value ? 'dark' : 'light'}</p>
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

In tests (`weft/test`): `await net.offline()`, `net.online()`, `page.hide()`, `page.show()`, `page.blur()`,
`page.focus()`, `page.freeze()`, `page.resume()`, `page.leave({ persisted })`, `page.restore()`,
`page.media(query, true)`, `tabs.post(name, msg)`, `tabs.posted(name)`. Each test starts online, visible and focused with every query false. After each test
weft/test fails if anything is still open (**T012**); `leaks()` lists it.
