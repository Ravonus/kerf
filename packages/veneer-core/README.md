<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">@kerf-js/veneer-core</h1>

<p align="center">
  <strong>Veneer's behaviour, tokens and CSS, with no framework.</strong><br>
  Focus, keys, positioning, timers and motion as plain TypeScript over the DOM, for your own markup or your own binding.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kerf-js/veneer-core"><img src="https://img.shields.io/npm/v/@kerf-js/veneer-core?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/kerf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/kerf/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/kerf/quality.yml?branch=main&label=checks" alt="checks"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-145c3c" alt="Node 24 or later">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/kerf">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md) before you upgrade.

veneer-core is the layer under [`@kerf-js/veneer`](https://www.npmjs.com/package/@kerf-js/veneer) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/veneer)</sup>. It holds
everything about Veneer's components that isn't rendering: the keyboard and focus rules, overlay layering, positioning,
toasts, virtual lists, date maths, the design tokens and the CSS. Nothing in the main entry imports a framework, so it
works under Kerf, React, Solid or plain DOM.

Use it when you want your own markup with Veneer's behaviour, or when you're writing a Veneer binding for another framework.

## Highlights

- **No framework in the main entry.** A test (`test/agnostic.test.ts`) fails the build if any file in `src/` imports
  Kerf, React, Preact, Solid, Vue or Svelte, or contains JSX.
- **One shape for behaviour.** Every behaviour is an action, `(el, options) => { update, destroy }`, and every stateful
  widget a store with `get` and `subscribe`. A binding is rendering plus these calls.
- **The hard parts of accessibility.** Native `<dialog>` focus handling, a layer stack so Escape closes only the top
  overlay, APG keyboard patterns for menus, listboxes, tabs, grids and sliders, and live-region announcements.
- **CSS split per component.** `styles/veneer.css` holds the tokens; each component has its own file, so a page loads only
  the rules it uses.
- **Pure helpers you can test without a DOM.** Key-to-index maps, table sorting and paging, pivots, RRULE parsing, ISO
  dates and weeks, phone formatting, fuzzy ranking and a prebuilt search index.
- **Opt-in heavy parts.** Charts, canvas, dither, paint, motion and search are separate entries, so an app that doesn't use them
  loads none of them.

## Contents

- [When to use it](#when-to-use-it)
- [Install](#install)
- [Quick start](#quick-start)
- [Guide](#guide)
  - [Actions and stores](#actions-and-stores)
  - [Markup contract](#markup-contract)
  - [In a Kerf component: `use`](#in-a-kerf-component-use)
  - [Without Kerf](#without-kerf)
  - [CSS and tokens](#css-and-tokens)
  - [Dials](#dials)
- [Behaviours](#behaviours)
- [State machines and stores](#state-machines-and-stores)
- [Pure helpers](#pure-helpers)
- [Entries](#entries)
- [Recipes](#recipes)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [Contributing](#contributing)
- [License](#license)

## When to use it

Most Kerf apps should skip it.

| You want | Install |
|---|---|
| Finished components | [`@kerf-js/veneer`](https://www.npmjs.com/package/@kerf-js/veneer) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/veneer)</sup>. It brings this package with it |
| No Veneer at all | Neither. `npm create kerf -- --ui none` and `--ui tailwind` install neither |
| Your own markup with Veneer's keyboard, focus and motion | This package. `npm create kerf -- --ui headless` sets it up and imports `styles/veneer.css` |
| Veneer in another framework | This package, plus a thin binding of your own |

## Install

```bash
npm install @kerf-js/veneer-core
```

```bash
pnpm add @kerf-js/veneer-core
```

```bash
bun add @kerf-js/veneer-core
```

> [!NOTE]
> The package exports TypeScript source (`src/index.ts`), so your bundler must compile TypeScript from `node_modules`.
> `@kerf-js/core` is listed as a peer dependency; only the `@kerf-js/veneer-core/kerf` entry imports it. Node 24 or later
> is required.

## Quick start

Tabs on plain DOM, with no framework: `nextIndex` turns a key into the tab to move to, `indicator` slides the bar under
the selected tab, and `overflow` fades the edges of a tab list that scrolls.

```ts
import { indicator, nextIndex, overflow } from '@kerf-js/veneer-core'
import '@kerf-js/veneer-core/styles/veneer.css'
import '@kerf-js/veneer-core/styles/components/tabs.css'

const list = document.querySelector<HTMLElement>('[role="tablist"]')!
const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')]
const face = indicator(list, { selected: '[aria-selected="true"]' })
const scroll = overflow(list)

function select(i: number) {
  tabs.forEach((tab, j) => {
    tab.setAttribute('aria-selected', String(i === j))
    if (i === j) tab.removeAttribute('tabindex')
    else tab.setAttribute('tabindex', '-1')
    document.getElementById(
      tab.getAttribute('aria-controls')!,
    )!.hidden = i !== j
  })
  tabs[i]!.focus()
  face.update()
  scroll.update(tabs[i])
}

list.addEventListener('keydown', (e) => {
  const at = tabs.findIndex(
    (t) => t.getAttribute('aria-selected') === 'true',
  )
  const to = nextIndex(e.key, at, tabs.length)
  if (to < 0) return
  e.preventDefault()
  select(to)
})
```

```html
<div data-scope="tabs" data-part="root">
  <div data-part="list" role="tablist" aria-label="Settings">
    <button
      data-part="trigger"
      role="tab"
      type="button"
      id="t0"
      aria-controls="p0"
      aria-selected="true"
    >
      Account
    </button>
    <button
      data-part="trigger"
      role="tab"
      type="button"
      id="t1"
      aria-controls="p1"
      aria-selected="false"
      tabindex="-1"
    >
      Billing
    </button>
    <span data-part="indicator" aria-hidden="true"></span>
  </div>
  <div
    data-part="content"
    role="tabpanel"
    id="p0"
    aria-labelledby="t0"
    tabindex="0"
  >
    Account settings
  </div>
  <div
    data-part="content"
    role="tabpanel"
    id="p1"
    aria-labelledby="t1"
    tabindex="0"
    hidden
  >
    Billing settings
  </div>
</div>
```

This is adapted from the package's portability test, `test/portable.test.ts`.

## Guide

### Actions and stores

Two shapes cover the whole package.

```ts
/** What a binding attaches to an element. */
interface Action<O = void> {
  update(opts: O): void
  destroy(): void
}

/** A value a binding can read and watch. */
interface Store<S> {
  get: () => S
  subscribe: (fn: (state: S) => void) => () => void
}
```

An action is a function `(element, options) => Action`. Call it once the element is in the document, call `update`
with new options when they change, and `destroy` when the element goes. Options carry callbacks such as `onClose`,
`onChange` or `onPick`; the action never changes your state itself. It asks, and your code decides.

```ts
const bar = indicator(list, { selected: '[aria-selected="true"]' })
bar.update() // after the selection changes
bar.destroy() // when the element goes
```

A store holds a stateful widget's list or value. `store(initial)` makes one with `get`, `set` and `subscribe`. A binding
copies `get()` into its own reactive cell in `subscribe`: a box in Kerf, `useSyncExternalStore` in React.

### Markup contract

Actions find their parts by attribute, never by class. The CSS styles the same attributes:

| Attribute | Means |
|---|---|
| `data-scope="tabs"` | The root of a component; CSS and actions key on it |
| `data-part="trigger"` | A named part inside the scope |
| `data-state="open"` | State the CSS draws, written by the action or the binding |
| `data-close`, `data-close-popover` | A button inside a dialog or popover that closes it |
| `data-expression`, `data-theme`, `data-density`, `data-motion`, `data-flair`, `data-palette` | Dials, on any element; scopes nest |

The markup for each component is the specimen in Veneer's design spec,
[docs/design/veneer](https://github.com/Ravonus/kerf/tree/main/docs/design/veneer). `@kerf-js/veneer`'s components render
exactly that markup, so their source is a working reference for each action.

### In a Kerf component: `use`

`use` comes from `@kerf-js/veneer-core/kerf`, the one entry that imports `@kerf-js/core`. It starts the action a microtask
after mount, so hydration writes nothing and nothing runs on the server. It calls `update` when the options change and
`destroy` with the component.

```ts
use(action, () => element, () => options)
```

`update` runs only when the value from the options getter changes. An option the action doesn't read still counts, so
read a box there to re-run it, like `at` in the tabs below.

```tsx
import { indicator, nextIndex } from '@kerf-js/veneer-core'
import { use } from '@kerf-js/veneer-core/kerf'
import '@kerf-js/veneer-core/styles/veneer.css'
import '@kerf-js/veneer-core/styles/components/tabs.css'
import { state } from '@kerf-js/core'

const names = ['Plan', 'Billing', 'Team']

export function Settings() {
  const at = state(0)
  let list: HTMLDivElement | undefined
  use(
    indicator,
    () => list,
    () => ({
      selected: '[aria-selected="true"]',
      at: at.value,
    }),
  )

  const onKey = (e: KeyboardEvent) => {
    const to = nextIndex(e.key, at.value, names.length)
    if (to < 0) return
    e.preventDefault()
    at.value = to
    const tabs = list?.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs?.[to]?.focus()
  }

  return (
    <div
      data-scope="tabs"
      data-part="root"
    >
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
        <span
          data-part="indicator"
          aria-hidden="true"
        ></span>
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

A menu. `menu` moves focus in when `open` turns true. It handles arrows, typeahead, Enter, Escape, Tab and an outside
press, and calls `onClose`. Showing and hiding the panel is yours; here that's `hidden`. Items need `tabindex="-1"`.

```tsx
import { menu } from '@kerf-js/veneer-core'
import { use } from '@kerf-js/veneer-core/kerf'
import { state } from '@kerf-js/core'

export function AccountMenu() {
  const open = state(false)
  let button: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  use(
    menu,
    () => panel,
    () => ({
      open: open.value,
      trigger: () => button,
      onClose: () => (open.value = false),
    }),
  )

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

### Without Kerf

Outside Kerf, make the action yourself and hold on to it. A modal dialog with plain DOM:

```ts
import { dialog } from '@kerf-js/veneer-core'
import '@kerf-js/veneer-core/styles/veneer.css'
import '@kerf-js/veneer-core/styles/components/dialog.css'

const el = document.querySelector('dialog')!
let open = false
const close = () => d.update({ open: (open = false), onClose: close })
const d = dialog(el, { open, onClose: close })

document.getElementById('delete')!.addEventListener('click', () => {
  d.update({ open: (open = true), onClose: close })
})
```

```html
<button id="delete">Delete</button>
<dialog data-scope="dialog" aria-labelledby="dt">
  <div data-part="header">
    <h2 data-part="title" id="dt">Delete item?</h2>
    <button data-part="close" data-close aria-label="Close">×</button>
  </div>
  <div data-part="body">This can't be undone.</div>
</dialog>
```

`showModal()` runs, focus goes to `[autofocus]` or the title, and the `[data-close]` button, Escape or a backdrop press
calls `onClose`. Focus returns to the button that opened it.

Toasts are a store plus an action on the region. Render the list however you like; the action handles timers, hover
pause, swipe and keys:

```ts
import { toastStore, toaster } from '@kerf-js/veneer-core'

const region = document.querySelector<HTMLElement>(
  '[data-scope="toast"][data-part="region"]',
)!
const toasts = toastStore()

toasts.subscribe((list) => {
  region.replaceChildren(
    ...list.map((t) => {
      const el = document.createElement('div')
      Object.assign(el.dataset, {
        scope: 'toast',
        part: 'root',
        id: t.id,
        tone: t.tone ?? 'neutral',
      })
      if (t.state) el.dataset.state = t.state
      el.setAttribute('role', 'group')
      el.innerHTML =
        '<div data-part="title"></div>' +
        '<button data-x aria-label="Dismiss">×</button>'
      el.firstElementChild!.textContent = t.title
      el.querySelector('button')!.onclick = () => toasts.dismiss(t.id)
      return el
    }),
  )
})
const action = toaster(region, toasts)

toasts.show({ title: 'Saved', tone: 'positive' })
```

In React the same pieces fit `useSyncExternalStore` for a store and `useEffect` for an action:

```tsx
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  indicator,
  toastStore,
  type Action,
} from '@kerf-js/veneer-core'

const toasts = toastStore()

export function useToasts() {
  return useSyncExternalStore(toasts.subscribe, toasts.get)
}

export function useIndicator(at: number) {
  const list = useRef<HTMLDivElement>(null)
  const bar = useRef<Action<any>>()
  useEffect(() => {
    bar.current = indicator(list.current!, {
      selected: '[aria-selected="true"]',
    })
    return () => bar.current?.destroy()
  }, [])
  useEffect(
    () => bar.current?.update({ selected: '[aria-selected="true"]' }),
    [at],
  )
  return list
}
```

> [!NOTE]
> There is no published React binding. The React snippet shows how the action and store shapes map onto hooks; it isn't
> a package.

### CSS and tokens

| Path | What it holds |
|---|---|
| `@kerf-js/veneer-core/styles/veneer.css` | The tokens, the base and the signature sweep, whole. Import it once |
| `@kerf-js/veneer-core/styles/components/*.css` | Buttons, dialogs, menus, tabs, toasts, tooltips and the rest |
| `@kerf-js/veneer-core/styles/inputs/*.css` | Fields, choices, listboxes, pickers, ranges |
| `@kerf-js/veneer-core/styles/rich/*.css` | Code, Markdown, rich text, calendars, address, phone, recurrence |
| `@kerf-js/veneer-core/styles/data/*.css` | Tables, charts, lists, stats, timelines, kanban |
| `@kerf-js/veneer-core/styles/layout/*.css` | Shell, side nav, stack, row, grid, split and other layout |
| `@kerf-js/veneer-core/styles/app/*.css`, `flows/*.css`, `canvas/*.css` | The app patterns, flows and canvas looks |
| `@kerf-js/veneer-core/styles/manifest.json` | For each component, the files to import, in order (its family's base first) |

`scripts/split-css.mjs` cuts these files out of the spec's stylesheets byte for byte, and `pnpm test` fails if they
drift. Skip them all and bring your own CSS if you like; the actions don't depend on it.

Every colour token is checked by `scripts/contrast-check.mjs` (shipped in the package), which resolves each colour at
every theme × expression stop and checks text, UI and focus-ring pairs against WCAG. `@kerf-js/veneer`'s plugin runs the
same checker on an app's theme.

### Dials

The dials live here, so a page without components can still switch them:

```ts
import {
  dialsFromUrl,
  getDial,
  setDial,
  setPalette,
} from '@kerf-js/veneer-core'

setDial('expression', 'vivid')
// Stored for the next visit
setDial('theme', 'dark', { persist: true })
// A named theme from veneer({ themes }); 'auto' for the default
setPalette('ocean')
dialsFromUrl() // applies ?expression=vivid and friends
getDial('density') // 'cozy'
```

| Dial | Values | Initial |
|---|---|---|
| `expression` | `quiet` `balanced` `vivid` | `balanced` |
| `fields` | `floating` `classic` | `floating` |
| `theme` | `auto` `light` `dark` | `auto` |
| `density` | `compact` `cozy` `comfortable` | `cozy` |
| `motion` | `auto` `full` `reduce` | `auto` |
| `flair` | `auto` `sweep` `none` | `auto` |

Each write is announced as a `veneer:dial` event on the document with `{ name, value }`. `setDial`'s `transition` option
wraps the write, for a View Transition or a theme wipe.

## Behaviours

Every action is `(el, options) => { update, destroy }` unless noted.

| Behaviour | Attach to | Options | What it does |
|---|---|---|---|
| `dialog` | a `<dialog>` | `open`, `onClose`, `onEscape?` | `showModal()`, focus to `[autofocus]` or the title, focus back to the opener on every close path, backdrop press closes unless `role="alertdialog"` |
| `popover` | a `popover="manual"` panel | `open`, `trigger`, `onClose`, `side?`, `align?` | Non-modal dialog placed by its trigger; focus moves in and back; focus leaving outside closes it |
| `tooltip` | a `role="tooltip"` panel | `trigger`, `side?`, `align?` | Shows on hover after 500 ms (at once within 300 ms of the last), on keyboard focus, and on a 500 ms touch long-press; hides on leave, press or Escape; one open at a time |
| `menu` | a `role="menu"` panel | `open`, `trigger`, `onClose`, `at?`, `side?`, `align?` | Roving items, ↑/↓ wrap, Home/End, PageUp/PageDown, typeahead, Enter/Space, Escape and Tab close |
| `listbox` | a select's trigger button | `label`, `items`, `value`, `onPick`, `open?`, `search?`, `presentation?`, `onOpenChange?` | Keys, typeahead, search, groups, and a sheet on a phone |
| `comboPopup` | a combobox's popup | `open`, `anchor`, `onClose` | Anchored like a popover, but focus stays in the input, which owns the keys |
| `pickerPanel` | a picker's `<dialog popover>` | panel options | A popover on desktop or a modal sheet on phones, decided each time it opens |
| `roving` | a composite container | `items`, `orientation?`, `onMove?` | One tab stop; arrows move focus among items, skipping disabled ones |
| `anchor(trigger, floating, { placement, gap })` | a floating element | | Fixed position by a trigger, flipping and clamped 8px inside the viewport, kept on scroll and resize |
| `indicator` | a tab list | `selected` | Slides `[data-part="indicator"]` under the selected item |
| `overflow` | a scrolling tab list | | `data-overflow="start end"` for edge fades; scrolls the selected tab into view |
| `edges` | a sideways scroller's parent | | Overflow hints and an overlay scrollbar that shows only when it moves |
| `navIndicator` | a nav | `axis?`, `spy?` | Slides a bar to the hovered, focused or current link; `spy` lights the link whose target is on screen |
| `sideNav` | a side navigation root | `current?`, `open?`, `onOpenChange?`, `collapsed?` | Docked or overlaid panel, folding sections, Escape, backdrop |
| `shell` | the app shell | `navOpen`, `current?`, `onToggle`, `onCloseNav`, `onWide`, `onCommand?` | Sidebar, keyboard and viewport behaviour; announces the new page's h1 on a route change |
| `slider` | a slider root | `values`, `min`, `max`, `step`, `format`, `onChange`, `names?`, `disabled?` | `role="slider"` thumbs with APG keys and a press anywhere on the track |
| `table` | `[data-scope="table"]` with an id | `hidden`, `rows?`, `onWidth?` | Hides columns with one scoped rule, so no row re-renders; pin offsets |
| `grid` | the wrapper of a `role="grid"` or treegrid | `tree?`, `rows?`, `onEdit?`, `onToggle?`, `onReorder?`, `onSelect?`, `onStatus?`, `onPaste?` | One tab stop, arrow keys between cells, ranges, TSV paste |
| `virtualizer` | a scroller | `keys`, `spacer`, `estimate`, `onRange`, and more | Only rows near the viewport in the DOM; sizes follow keys through inserts; `stick` keeps a chat at the end |
| `toaster(region, store)` | a toast region | | Timers, hover pause, swipe, F8, stacking |
| `field` / `floatingLabel` | `[data-scope="field"]` | | Floating label and notch, clear button, counter, press-to-focus |
| `formInvalid`, `formReset` | a control or form | `fn` | Draws the browser's constraint message in the field, never the bubble; hears a form reset |
| `richText` | a contenteditable | `onChange`, `onQuery?`, `onLink?`, `onState?`, `bubble?` | A rich text editor's commands, shortcuts and selection |
| `keyboardDock` | an editor toolbar | | On a phone, docks the toolbar above the on-screen keyboard |
| `codeLayer` | a `<pre aria-hidden>` behind a textarea | | Colours code with the CSS Custom Highlight API where it exists |
| `interact` | any element | an `Interactive` | Keeps hover, focus-visible and pressed flags, ignoring touch hover |
| `stepFlow` | `[data-scope="flow"]` | `step`, `steps`, `label`, `onStep`, `history?`, `announce?` | The step machine: exit and enter, direction, focus, announcement, `?step=` in history |
| `otpInput` | `[data-scope="otp"]` | | One real input painted into cells; paste of the whole code |
| `tourSpot`, `coachSpot` | a tour or coachmark layer | | Spotlight, ring, card placement, focus kept in the card |
| `kanban` | a board | | Drag and keyboard moves between virtual columns |
| `syncedForm` | a `<form>` | | Every named control shared; a focused field is never overwritten |
| `cursorsLayer`, `followViewport`, `autoTrack` | collaboration layers | | Peer cursors, following a peer, following a presenter |
| `leaveGuard` | a form | `onAttempt` | Asks before leaving a dirty form |
| `chart` (`/charts`) | a rendered chart figure | `ChartOptions` | Owns the plot, tooltip, keyboard and legend from then on |
| `surface` (`/canvas`) | a `<canvas>` | `SurfaceOptions` | Size, pixel ratio, off-screen pause, one shared frame loop |
| `stage` (`/stage`) | a `<canvas>` | `StageOptions` | Paints every `[data-skin]` element laid out over it |

Document-wide helpers, called once:

| Function | What it does |
|---|---|
| `flow()` | Arms scroll motion (`data-flow`) after the first scroll, so the first screen and crawlers see every word |
| `copyButtons()` | One listener for every `[data-act="copy"]` button in the document |
| `installSweep()` | Returns the `SweepMachine` for pinning and confirming the sweep |
| `pressOrigin()` | Makes a vivid button's fill follow the pointer (`data-follow`) |
| `markDevice()` | Sets `<html data-device="mobile|desktop">` and keeps it current |
| `paletteHotkey(el, { key, slash?, onPress })` | Cmd or Ctrl+`key` anywhere in the element's document (an action); `slash` also takes `/` outside text fields |
| `pushLayer()`, `onTopModal()`, `justEscaped()` | The overlay layer stack that makes Escape close only the top layer |
| `announce(doc, text, assertive?)` | Writes into the pre-mounted polite or assertive announcer |

## State machines and stores

The stateful parts, with their states and where they change.

| Machine | Entry | States | Driven by |
|---|---|---|---|
| Toast list | `toastStore()` | each toast: shown (with `life` in ms), `closed` or `swiped`, then removed | `show`, `dismiss`, `promise`; `toaster` runs the timers |
| Promise toast | `toastStore().promise(p, m)` | `loading` → `done` or `error`, in place | The promise settling |
| Answer | `foldAnswer(events)` or `foldAnswer(answer, event)` | `waiting` `streaming` `approval` `done` `stopped` `error` | `AgentEvent`s (`text`, `reasoning`, `tool`, `tool-result`, `approval`, …). Never mutates; unchanged items keep identity |
| Tool call | `Answer.tools[]` | `running` `done` `failed` `approval` `denied` | `tool`, `approval` and `tool-result` events |
| Plan step | `Answer.plan[]` | `pending` `running` `done` `blocked` | Plan events |
| Step flow | `stepFlow(el, opts)` | current step `active`, the old one leaving until its exit ends | `update({ step })`, Back, `?step=` |
| Live connection | `liveState(status)` | `connecting` `live` `reconnecting` `offline` | Maps `.live`, `stream().status` and `channel.status`; `worstLive` picks the worst of several |
| Dictation | `dictation()` | `idle` `listening` `blocked` `unsupported` | Web Speech and mic permission; blocked and unsupported are states, not throws |
| Virtual list | `virtualizer()` | rendered range, anchor, `stuck` | Scroll, resize, `update`, `scrollTo`, `scrollToEnd` |
| Sweep | `installSweep()` | resting, pinned (`data-pin`), confirming (`data-confirm`) | `pin`, `confirm`; CSS follows hosts on its own |
| Dials | `setDial`, `setPalette` | one value per dial on each root | Writes, `persist`, `dialsFromUrl` |

> [!NOTE]
> [docs/STATE-MACHINES.md](https://github.com/Ravonus/kerf/blob/main/docs/STATE-MACHINES.md) covers the runtime
> lifecycles in `@kerf-js/core` and [`@kerf-js/start`](https://www.npmjs.com/package/@kerf-js/start) (navigation, islands, live sockets). None of those live in
> veneer-core; its machines are the ones above.

## Pure helpers

Functions with no DOM, safe on a server and easy to test.

<details>
<summary><strong>Focus, layout and type</strong></summary>

| Export | What it does |
|---|---|
| `nextIndex(key, at, count)` | The index a key moves to in a composite: arrows wrap, Home/End jump, right-to-left flips; `-1` for any other key |
| `place(layer, trigger, side, align, gap)` | Positions a top-layer element by its trigger, flipping and clamping |
| `moveShuttle(face, a, b, across?)` | Moves an indicator face to span `a` to `b` along its axis |
| `uid(prefix?)`, `resetIds()` | Document-unique ids for ARIA wiring, stable between server render and hydration |
| `fluid(minPx, maxPx)`, `fluidCss`, `fluidRatio`, `TYPE_SCALE` | Fluid type sizes in the spec's form |
| `skeletonShape(spec)`, `isPart` | The skeleton for a content shape, as data |
| `isMobileDevice()` | True for a device used by touch |
| `labelChars(text)` | A label's letters, as the field anatomy renders them |

</details>

<details>
<summary><strong>Tables, grids and lists</strong></summary>

| Export | What it does |
|---|---|
| `compareValues`, `sortRows`, `filterRows`, `pageSlice`, `rangeOf`, `checkState`, `hideRule` | Table sorting, filtering, paging, selection ranges and the column-hiding rule |
| `pageList(cur, total)` | Page buttons around the current page, with `'gap'` for what's skipped |
| `infiniteScroll(el, …)` | Loads more as a sentinel comes within 120px of view |
| `matchFilter`, `groupRows`, `aggregate`, `treeRows`, `leaves`, `pivotTable` | DataGrid filtering, grouping, aggregates, trees and pivots |
| `toTSV`, `parseTSV`, `toCSV`, `moved` | Copy, paste and export |
| `Sizes`, `slices` | O(log n) row offsets (a Fenwick tree), and work split between frames |

</details>

<details>
<summary><strong>Search, commands and text</strong></summary>

| Export | What it does |
|---|---|
| `buildIndex`, `openIndex`, `searchIndex`, `fuzzyIndex`, `words` | A prebuilt search index: build it at build time, open it once, query per key press |
| `fuzzy`, `matchStrength`, `rankCommands`, `marked` | Command palette ranking: word starts beat scattered letters |
| `mentionToken`, `parseMentions`, `serializeMentions`, `shiftMarks`, `findTrigger`, `caretPoint` | @mentions in plain text |
| `tokenize`, `highlight`, `indented`, `jsonProblem` | Code colouring and JSON errors with their line |
| `sanitizeHtml`, `safeUrl`, `markdownToHtml`, `htmlToMarkdown` | Allow-list HTML sanitising (works with no DOM) and Markdown conversion |

</details>

<details>
<summary><strong>Dates, times and recurrence</strong></summary>

| Export | What it does |
|---|---|
| `IsoDate`, `IsoTime`, `IsoDateTime`, `IsoMonth`, `IsoWeek`, `IsoDuration`, `IsoZoned`, `DateRange` | Typed ISO strings |
| `addDays`, `addMonths`, `daysBetween`, `isoWeek`, `weekStart`, `todayIso`, `parseDate`, `parseTime`, `offsetAt` … | Date arithmetic and locale-aware parsing |
| `segmentParts`, `press`, `settle`, `readDate`, `readTime` | The segmented date and time field model |
| `monthWeeks`, `dayState`, `pickRange` | The calendar grid |
| `parseRule`, `stringifyRule`, `occurrences`, `ruleSentence` | RRULE parsing and "Every 2 weeks on Tuesday…" sentences |
| `layoutDay`, `overlaps`, `conflicts`, `dragMove`, `dragResize`, `dragCreate`, `moveKey`, `snapTo` | Calendar event layout and moves |

</details>

<details>
<summary><strong>Identity, commerce and admin</strong></summary>

| Export | What it does |
|---|---|
| `PHONE_COUNTRIES`, `formatPhone`, `inferCountry` | Phone numbers that format as typed |
| `zoneRows`, `localZone`, `regionCodes`, `languageCodes`, `currencyCodes`, `displayName` | Time zones, countries, languages and currencies from `Intl` |
| `addressFormat`, `addressPart` | Which address fields a country uses |
| `cardBrand`, `cardMask` | A card's brand from its BIN, and `•••• 4242` |
| `cartTotals`, `prorate`, `planPrice`, `meterParts`, `money` | Cart totals, plan proration, usage meters |
| `passwordRules`, `passwordStrength`, `isEmail`, `mapFlowError` | Auth form checks and one-sentence error messages |
| `strokeWidth`, `paintStrokes`, `signatureSvg` | Signature strokes and their SVG |

</details>

## Entries

| Import | What it has |
|---|---|
| [`@kerf-js/veneer-core`](https://www.npmjs.com/package/@kerf-js/veneer-core) | Everything above: actions, stores, dials and pure helpers. No framework |
| `@kerf-js/veneer-core/kerf` | `use`, the Kerf binding. The only entry that imports `@kerf-js/core` |
| `@kerf-js/veneer-core/motion` | `enter`, `exit`, `leave`, `stagger`, `reducedMotion`: Web Animations presets timed from Veneer's motion tokens |
| `@kerf-js/veneer-core/charts` | `chart`, `spark`, the chart forms and their scene; its own entry so an app with no chart loads none |
| `@kerf-js/veneer-core/canvas` | `surface`: a canvas that tracks size and pixel ratio and shares one frame loop |
| `@kerf-js/veneer-core/stage` | `stage`, `stageSelect`: a canvas that paints the page laid out over it |
| `@kerf-js/veneer-core/dither` | Dithering as plain TS: `tile`, `quantize`, `diffuse`, `palette`, `ditherField` and more |
| `@kerf-js/veneer-core/paint` | Hand-painted pixel art: `Raster` paints shapes in flat bands of a ramp with brushed seams and rings them; `ramp`, `light`, `rng`, `wave` |
| `@kerf-js/veneer-core/search` | The search index on its own |
| `@kerf-js/veneer-core/styles/*` | The CSS: `veneer.css` and one file per component |

Motion always honours reduced motion: under it, `enter` is a 120 ms fade with no travel.

## Recipes

**A tooltip on any button**

```ts
import { tooltip } from '@kerf-js/veneer-core'

const trigger = document.getElementById('copy')!
// Popover="manual" role="tooltip"
const tip = document.getElementById('copy-tip')!
// The binding's job, not the action's
trigger.setAttribute('aria-describedby', tip.id)
const t = tooltip(tip, { trigger, side: 'top' })
```

**Rank commands for a palette of your own**

```ts
import { paletteHotkey, rankCommands } from '@kerf-js/veneer-core'

const hotkey = paletteHotkey(document.body, {
  key: 'k',
  onPress: () => openPalette(),
})
// Best first, gathered by group
const shown = rankCommands(commands, query)
hotkey.destroy() // when the palette goes
```

**Search a prebuilt index**

```ts
import {
  buildIndex,
  openIndex,
  searchIndex,
} from '@kerf-js/veneer-core/search'

// at build time
const wire = buildIndex(pages)
// in the page
const ix = openIndex(wire)
const hits = searchIndex(ix, 'tabs')
```

## Troubleshooting

**An action does nothing.** It runs against the specimen markup: check `data-scope`, `data-part` and the ARIA roles
match the spec. A menu's items need `tabindex="-1"` and `role="menuitem"`. `table` needs an `id` on its root.

**`update` doesn't fire in Kerf.** `use` calls `update` only when the value its options getter returns changes. Read
the box the action depends on inside the getter.

**Escape closes two overlays.** Open overlays through `dialog`, `popover` and `comboPopup`, which share the layer
stack. A custom overlay should `pushLayer` and check `justEscaped()`.

**`setPalette` throws a `RangeError`.** A palette name is lowercase letters, digits and dashes.

**No styles.** Import `styles/veneer.css` once, then each component's own file. `styles/manifest.json` lists the files
each component needs.

**Scroll motion never runs.** Call `flow()` once on the client.

## Related packages

| Package | What it is |
|---|---|
| [`@kerf-js/veneer`](https://www.npmjs.com/package/@kerf-js/veneer) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/veneer)</sup> | Veneer's components for Kerf, built on this package |
| [`@kerf-js/veneer-icons`](https://www.npmjs.com/package/@kerf-js/veneer-icons) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/veneer-icons)</sup> | 651 original icons in Veneer's three expression tiers |
| [`@kerf-js/core`](https://www.npmjs.com/package/@kerf-js/core) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/core)</sup> | The Kerf runtime; needed only for `@kerf-js/veneer-core/kerf` |
| [`create-kerf`](https://www.npmjs.com/package/create-kerf) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/create-kerf)</sup> | `npm create kerf -- --ui headless` starts an app on this package |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/kerf/blob/main/CONTRIBUTING.md). In `packages/veneer-core`:

```bash
pnpm test             # checks styles/ against the spec, then vitest
# Regenerate styles/ from docs/design/veneer/tokens
pnpm run build:css
```

Keep `src/` free of framework imports and JSX; `test/agnostic.test.ts` enforces it.

## License

[MIT](https://github.com/Ravonus/kerf/blob/main/LICENSE)
