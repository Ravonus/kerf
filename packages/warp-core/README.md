# @weft-js/warp-core

> **Early release (0.1.x).** APIs can change between minor versions.

Warp's behaviour, tokens and CSS, with no components: plain TypeScript over the DOM. `@weft-js/warp` builds its components
on it. Nothing in the main entry imports a framework, so it works under Weft, React, Solid or no framework at all.

```bash
npm install @weft-js/warp-core
```

## When to skip it

Most Weft apps should skip it.

- **You want finished components:** install `@weft-js/warp`. It brings this package with it.
- **You want no Warp at all:** you need neither package. `npm create @weft-js -- --ui none` and `--ui tailwind` install
  neither.
- **You want your own markup and Warp's keyboard, focus and motion:** this package is for you. `npm create @weft-js -- --ui headless`
  sets it up.

## What's in it

- **Behaviour:** `menu`, `dialog`, `popover`, `tooltip`, `indicator`, `roving`, `slider` and more.
  Each is an action, `(el, options) => { update, destroy }`.
- **Helpers:** pure functions such as `nextIndex`, `place` and `uid`.
- **CSS:** `@weft-js/warp-core/styles/warp.css` has the tokens. Each component has its own file, such as
  `@weft-js/warp-core/styles/components/tabs.css`. Skip them and bring your own CSS if you like.
- **Other entries:** `/motion`, `/charts`, `/canvas`, `/dither` and `/search`.

## `use`: an action in a Weft component

`use` comes from `@weft-js/warp-core/weft`, the one entry that needs `@weft-js/core`. It starts the action once the element is in the
document, never on the server. It calls `update` when the options change and `destroy` with the component.

```ts
use(action, () => element, () => options)
```

`update` runs only when the value from the options getter changes. An option the action doesn't read still counts, so
read a box there to re-run it, like `at` in the tabs below.

Outside Weft, make the action yourself:

```ts
const bar = indicator(list, { selected: '[aria-selected="true"]' })
bar.update() // after the selection changes
bar.destroy() // when the element goes
```

## Tabs

`nextIndex` turns a key into the tab to move to: arrows wrap, and Home and End jump. It returns -1 for any other key.
`indicator` slides the `data-part="indicator"` element to the selected tab.

```tsx
import { indicator, nextIndex } from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'
import '@weft-js/warp-core/styles/warp.css'
import '@weft-js/warp-core/styles/components/tabs.css'
import { state } from '@weft-js/core'

const names = ['Plan', 'Billing', 'Team']

export function Settings() {
  const at = state(0)
  let list: HTMLDivElement | undefined
  use(indicator, () => list, () => ({
    selected: '[aria-selected="true"]',
    at: at.value,
  }))

  const onKey = (e: KeyboardEvent) => {
    const to = nextIndex(e.key, at.value, names.length)
    if (to < 0) return
    e.preventDefault()
    at.value = to
    const tabs = list?.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs?.[to]?.focus()
  }

  return (
    <div data-scope="tabs" data-part="root">
      <div
        ref={(n: any) => (list = n)}
        data-part="list"
        role="tablist"
        aria-label="Settings"
        onKeyDown={onKey}
      >
        {names.map((name, i) => (
          <button
            key={name}
            data-part="trigger"
            role="tab"
            type="button"
            aria-selected={at.value === i ? 'true' : 'false'}
            tabindex={at.value === i ? undefined : '-1'}
            onClick={() => (at.value = i)}
          >
            {name}
          </button>
        ))}
        <span data-part="indicator" aria-hidden="true"></span>
      </div>
      <div
        data-part="content"
        role="tabpanel"
        tabindex="0"
      >
        {names[at.value]}
      </div>
    </div>
  )
}
```

## A menu

`menu` moves focus in when `open` turns true. It handles arrows, typeahead, Enter, Escape, Tab and an outside press, and
calls `onClose`. Showing and hiding the panel is yours. Here that's `hidden`. Items need `tabindex="-1"`.

```tsx
import { menu } from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'
import { state } from '@weft-js/core'

export function AccountMenu() {
  const open = state(false)
  let button: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  use(menu, () => panel, () => ({
    open: open.value,
    trigger: () => button,
    onClose: () => (open.value = false),
  }))

  const pick = (run: () => void) => {
    open.value = false
    button?.focus()
    run()
  }

  return (
    <div>
      <button
        ref={(n: any) => (button = n)}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open.value ? 'true' : 'false'}
        onClick={() => (open.value = !open.value)}
      >
        Account
      </button>
      <div
        ref={(n: any) => (panel = n)}
        role="menu"
        hidden={!open.value}
      >
        <button
          role="menuitem"
          tabindex="-1"
          type="button"
          onClick={() => pick(() => (location.hash = 'profile'))}
        >
          Profile
        </button>
        <button
          role="menuitem"
          tabindex="-1"
          type="button"
          onClick={() => pick(() => (location.hash = 'out'))}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
```

## Links

- [Source](https://github.com/Ravonus/weft/tree/main/packages/warp-core)
- [Weft on GitHub](https://github.com/Ravonus/weft): the framework, the docs and every package
- [Changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md)
- [Issues](https://github.com/Ravonus/weft/issues)
