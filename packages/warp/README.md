<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/warp</h1>

<p align="center">
  <strong>Weft's UI toolkit: over 240 accessible components, themed from one config.</strong><br>
  Keyboard support, screen-reader names and checked contrast are built into each component, not left for you to add.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/warp"><img src="https://img.shields.io/npm/v/@weft-js/warp?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/weft/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/weft/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/weft/quality.yml?branch=main&label=checks" alt="checks"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-145c3c" alt="Node 24 or later">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/weft/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md) before you upgrade.

Warp is the component library for [Weft](https://github.com/Ravonus/weft) apps. It covers layout, type, fields, pickers,
overlays, tables, charts and whole app flows such as sign-in, settings, chat, calendars and checkout. One `warp()` call in
`weft.config.ts` sets the look of every component, and the build checks the colours you choose against WCAG contrast
before it ships them.

The components and their look live here. Their behaviour (focus, keys, positioning, timers) lives in
[`@weft-js/warp-core`](https://www.npmjs.com/package/@weft-js/warp-core) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp-core)</sup>, which works without any framework.

## Highlights

- **Accessible by construction.** Every field requires a `label`, every table a `caption`, and an icon-only button a
  `label`. Leaving one out is a type error. Composite widgets follow the WAI-ARIA Authoring Practices keyboard patterns.
- **Contrast is a build error.** A seed, colour or token that drops text, a control border or the focus ring below WCAG
  contrast at any theme and expression stop fails the build with D010, which names each failing pair.
- **One config, every component.** `warp({ seed, dials, radius, fonts, colors, system, parts, themes })` re-themes the
  whole kit. Named themes switch at run time with `setPalette()`.
- **Dials instead of variants.** Expression (`quiet`, `balanced`, `vivid`), density, theme, motion and flair are
  `data-*` attributes. They nest, so one region can be compact and dark inside a cozy, light page.
- **A page pays for what it renders.** Each component imports only its own CSS. `pnpm run size` measures what each one
  costs alone, ten times over, and on a page that already has the rest.
- **No code at load.** Components run nothing as they load, so an island holding them can wait for the screen or a tap.
- **Whole flows, not just parts.** Sign-in, MFA, onboarding tours, settings, members, billing, cart and checkout,
  an AI chat, a calendar, a video room and multiplayer cursors ship as ready components.
- **Tailwind if you want it.** `@weft-js/warp/tailwind.css` exposes Warp's tokens as Tailwind v4 theme values, so
  utilities follow the dials too.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Guide](#guide)
  - [What the plugin does](#what-the-plugin-does)
  - [Layout and intent props](#layout-and-intent-props)
  - [Fields and forms](#fields-and-forms)
  - [Overlays](#overlays)
  - [Toasts](#toasts)
  - [Tables and long lists](#tables-and-long-lists)
  - [Scroll motion](#scroll-motion)
- [Component catalogue](#component-catalogue)
- [Theming](#theming)
- [The Theme studio](#the-theme-studio)
- [Accessibility](#accessibility)
- [Tailwind](#tailwind)
- [Per-page cost](#per-page-cost)
- [API reference](#api-reference)
- [Recipes](#recipes)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [Contributing](#contributing)
- [License](#license)

## Install

A new app made with `npm create @weft-js` gets Warp by default (`--ui warp`). The other choices are `headless`
(`@weft-js/warp-core` only), `tailwind` and `none`.

To add Warp to an existing Weft app, let the CLI install it and add the plugin to your config, whatever format the config
is in:

```bash
npx weft add warp
```

Or install it yourself:

```bash
npm install @weft-js/warp
```

```bash
pnpm add @weft-js/warp
```

```bash
bun add @weft-js/warp
```

Then add the plugin:

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({ plugins: [warp()] })
```

`@weft-js/core` is a peer dependency. Warp depends on
[`@weft-js/warp-core`](https://www.npmjs.com/package/@weft-js/warp-core) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp-core)</sup> and
[`@weft-js/warp-icons`](https://www.npmjs.com/package/@weft-js/warp-icons) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp-icons)</sup>, so both arrive with it. Node 24
or later is required.

## Quick start

Import what you use. A page pays only for the components it renders.

```tsx
import { state } from '@weft-js/core'
import { Badge, Button, Card } from '@weft-js/warp'

export default function Product() {
  const inCart = state(0)
  return (
    <Card eyebrow="Coffee" title="House blend, 250 g">
      <p>
        In your cart <Badge count>{inCart.value}</Badge>
      </p>
      <Button onClick={() => inCart.value++}>Add to cart</Button>
    </Card>
  )
}
```

A fuller page, with layout primitives and a field:

```tsx
import {
  Button,
  Card,
  Heading,
  Input,
  Row,
  Stack,
  Text,
} from '@weft-js/warp'

export function Billing() {
  return (
    <Stack
      as="section"
      gap="section"
    >
      <Heading
        level={1}
        role="title"
      >
        Billing
      </Heading>
      <Card title="Card on file">
        <Stack gap="related">
          <Text subtle>Visa ending 4242</Text>
          <Input
            label="Billing email"
            type="email"
          />
          <Row
            gap="tight"
            justify="end"
          >
            <Button emphasis="ghost">Cancel</Button>
            <Button>Save</Button>
          </Row>
        </Stack>
      </Card>
    </Stack>
  )
}
```

## Guide

### What the plugin does

`warp()` is a Weft plugin (namespace `D`). At build time it:

- validates its options and rejects unknown keys with the path of the bad one;
- writes Warp's tokens and your overrides as CSS, plus a Tailwind entry when you define `colors`;
- runs warp-core's contrast checker over the resolved stylesheet and fails with **D010** on any pair below WCAG;
- registers a catalogue of components for `weft plugins` and short instructions for coding agents;
- gives generated share cards (`site.card`) your page, text and accent colours.

It also exports `dialScript`, a tiny inline script for `site.head` that restores dials saved with
`setDial(…, { persist: true })` before the first paint, so a prerendered page doesn't flash the OS theme:

```ts
import { defineConfig } from '@weft-js/core/config'
import { dialScript, warp } from '@weft-js/warp/plugin'

export default defineConfig({
  site: { head: dialScript },
  plugins: [warp()],
})
```

### Layout and intent props

Name what a thing is and the look follows the theme, the dials and the density. Raw values are reported by `weft check`
as D001–D007.

| Thing | Use |
|---|---|
| Vertical flow | `Stack gap align divided` |
| Horizontal cluster | `Row gap justify align wrap reflow` (`reflow` stacks it below a width step) |
| Columns | `Grid min cols gap` |
| Side and main | `Split side width at gap` |
| Measured column | `Center max gutter intrinsic` |
| Full screen, one centred child | `Cover`, with `data-part="center"` on the child |
| Media box | `Frame ratio` |
| Push to the far end | `Spacer` |
| Sunken region | `Inset pad` |
| Raised box | `Card` |
| Heading | `Heading level role`: `level` is the outline and picks the look; `role` overrides it |
| Text | `Text role tone subtle faint inline` |
| Link | `Link href subtle external` |

`gap` is a relationship, not a size: `none hair tight related group section page`. There are no breakpoint props,
because boxes answer to their container.

`Heading` and `Text` load only their role rules and your tokens (`weft:tokens/warp`), so a page that sets its look
with warp's tokens alone can use them for a few hundred bytes. warp's own role values, and `tone`, come with warp's
sheet, which every other component loads.

Components share three intent props:

| Prop | Values | Default |
|---|---|---|
| `tone` | `neutral` `accent` `positive` `caution` `critical` `info`, plus any name from `warp({ colors })` | `accent` on Button |
| `emphasis` (Button) | `solid` `soft` `outline` `ghost` `frame` `link` | `solid` |
| `size` | `sm` `md` `lg` | `md` |

### Fields and forms

Every field is built on the same shell: a floating label in a notch (or above the box with `variant="classic"` or
`warp({ fields: 'classic' })`), an optional icon, prefix, suffix, clear button, counter, hint and error.

```tsx
import { Input, NumberField, Select, Textarea } from '@weft-js/warp'
import { state } from '@weft-js/core'

export function Profile() {
  const region = state<string | null>('eu')
  return (
    <form>
      <Input
        label="Display name"
        hint="Shown on your posts"
        counter={40}
        clearable
      />
      <Input
        label="Website"
        type="url"
        prefix="https://"
        error="That address doesn't resolve"
      />
      <NumberField
        label="Weight"
        suffix="kg"
      />
      <Select
        label="Region"
        value={region}
        options={[
          { value: 'eu', label: 'Europe' },
          {
            value: 'us',
            label: 'United States',
            hint: 'Virginia and Oregon',
          },
        ]}
      />
      <Textarea
        label="Bio"
        rows={3}
      />
    </form>
  )
}
```

| Field prop | Type | Default | What it does |
|---|---|---|---|
| `label` | `string` | required | The accessible name, drawn as the floating label |
| `hint` | node | | Help under the field |
| `error` | node | | Shown instead of the hint; marks the field invalid |
| `icon` | icon name or component | | Leading icon; it sweeps with the border |
| `prefix`, `suffix` | node | | Inside the field, before or after the value (`$`, `kg`) |
| `variant` | `floating` · `classic` | the app's `fields` | Where the label sits |
| `appearance` | `line` | boxed | Only a bottom line under the value |
| `size` | `sm` · `md` · `lg` | `md` | |
| `clearable` | `boolean` | `false` | A clear button once there is a value |
| `counter` | `number` | | Maximum length, shown as `n/max` |
| `readonly` | `boolean` | `false` | Selectable and copyable, not editable |

Any other attribute (`type`, `autocomplete`, `inputmode`, `required`) passes through to the native control. Warp draws
the browser's constraint message in the field itself, never as the browser bubble, and moves focus to the first invalid
control. `Textarea` grows from `rows` to 10 lines, and Cmd or Ctrl+Enter submits its form.

Rich fields (`DateField`, `TimeField`, `Select`, `PhoneField` and the rest) share `Bindable<T>`: pass `value` as a
plain value or a `State`, or use `defaultValue`. `onValueChange(value, reason)` tells you whether a pointer, a key or
code made the change.

### Overlays

`Modal` and `Drawer` sit on the native `<dialog>`. Focus moves to `[autofocus]` or the title, returns to the opener on
every close path, and CSS locks the page's scroll. `open` is a box: the dialog writes `false` when the user closes it.
Any element with `data-close` closes them. A backdrop press closes them too, except an `alert` dialog, where you give
Cancel `autofocus`. Layers stack, so Escape closes only the top one.

```tsx
import { state } from '@weft-js/core'
import { Button, Modal } from '@weft-js/warp'

export function DeleteProject(props: {
  onDelete: () => Promise<void>
}) {
  const open = state(false)
  const remove = async () => {
    await props.onDelete()
    open.value = false
  }
  return (
    <>
      <Button
        tone="critical"
        emphasis="outline"
        onClick={() => (open.value = true)}
      >
        Delete project
      </Button>
      <Modal
        open={open}
        alert
        title="Delete this project?"
        description="Its pages and history go with it."
        footer={
          <>
            <Button
              emphasis="ghost"
              data-close=""
              autofocus
            >
              Cancel
            </Button>
            <Button
              tone="critical"
              onClick={() => remove()}
            >
              Delete
            </Button>
          </>
        }
      />
    </>
  )
}
```

| Component | Key props | Notes |
|---|---|---|
| `Modal` | `open: State<boolean>`, `title`, `description`, `footer`, `size` (`sm` `md` `lg`), `placement` (`center` `top` `bottom` `left` `right` `full`), `alert`, `tone`, `inline` | `alert` makes it an AlertDialog |
| `Drawer` | `open`, `title`, `description`, `footer`, `side` (`auto` `right` `left` `bottom` `top`), `inline` | `auto` is a side sheet on wide screens and a bottom sheet on phones |
| `Popover` | `label`, `title`, `description`, `side`, `align`, `trigger` (Button props), `inline` | A non-modal dialog. Focus moves in and returns to the trigger |
| `Tooltip` | `content`, `kbd`, `side`, `align`, `inline`; `children` is the one focusable trigger | Shows on hover after 500 ms and on keyboard focus. Never holds essential content |
| `Menu` | `label`, `items`, `trigger`, `side`, `align` | Items are `{ label, onSelect, href, icon, shortcut, tone, disabled }`, `{ separator: true }` or `{ group }` |
| `CommandPalette` | see its props type | An APG combobox in a modal dialog, opened with Cmd or Ctrl+K |

`inline` draws an overlay open in the page's flow, with no top layer, scrim or focus trap. It is meant for docs and
previews.

```tsx
import { Button, Menu, Popover, Tooltip } from '@weft-js/warp'

export function Toolbar(props: { signOut: () => void }) {
  return (
    <>
      <Tooltip
        content="Copy link"
        kbd="⌘C"
      >
        <Button
          icon="copy"
          label="Copy link"
          emphasis="ghost"
        />
      </Tooltip>
      <Popover
        label="Filters"
        title="Filter results"
      >
        <p>Filter controls go here.</p>
      </Popover>
      <Menu
        label="Account"
        items={[
          { label: 'Profile', href: '/profile' },
          { separator: true },
          {
            label: 'Sign out',
            tone: 'critical',
            onSelect: props.signOut,
          },
        ]}
      />
    </>
  )
}
```

### Toasts

Mount one `<Toaster />` near the root, then call `toast` from anywhere:

```tsx
// src/routes/_layout.tsx
import { Toaster } from '@weft-js/warp'

export default function Layout(props: { children?: unknown }) {
  return (
    <>
      {props.children}
      <Toaster position="bottom-right" />
    </>
  )
}
```

```ts
import { toast } from '@weft-js/warp'

toast.show({
  title: 'Invite sent',
  description: 'mei@example.com',
  tone: 'positive',
})

toast.show({
  title: 'Message archived',
  action: { label: 'Undo', onClick: () => restore() },
})

// One toast through a promise's life, updated in place. Returns the
// promise.
await toast.promise(save(), {
  pending: 'Saving…',
  done: 'Saved',
  error: () => ({ title: "Couldn't save", tone: 'critical' }),
})
```

How they behave:

- **Life.** 5 s plus 60 ms a word, 10 s with an action. A critical toast with an action stays until it is dismissed.
- **Stacking.** Newest first. Three stack collapsed and fan out on hover or focus, which pauses every timer. Timers also
  pause while the page is hidden.
- **Dismissal.** Swipe, or the Dismiss button. F8 focuses the newest toast.
- **Announcements.** The Toaster pre-mounts a polite and an assertive live region. While a modal is open the regions
  move into it, because the modal would otherwise make them inert.
- **One list.** Every `Toaster` shares one list. If a page mounts two, only the newest shows it.

`position` is `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center` or `bottom-right` (the default).

### Tables and long lists

```tsx
import { Table, type Column } from '@weft-js/warp'

type Order = {
  id: string
  customer: string
  total: number
  status: string
}

const columns: Column<Order>[] = [
  { id: 'customer', header: 'Customer', rowHeader: true, sort: true },
  { id: 'total', header: 'Total', numeric: true, sort: true },
  { id: 'status', header: 'Status', priority: 2 },
]

export function Orders(props: { rows: Order[] }) {
  return (
    <Table
      caption="Recent orders"
      columns={columns}
      rows={props.rows}
      filter="Filter orders"
      selection
    />
  )
}
```

`Table` is a semantic `<table>` with sort, filter, column picking, resizing, selection with Shift-click ranges, a bulk
bar and phone cards (`phone="cards"`). `rows` can be an array, a `State`, a `Derived` or a `Resource`, and `server`
hands sorting, filtering and paging to your data source. `DataGrid` is the same parts as an ARIA grid, or a treegrid when
grouped, with one tab stop and arrow keys between cells. `PivotTable`, `VirtualList`, `Feed` and `ScrollGrid` cover
pivots, long lists, activity feeds and two-axis windows.

### Scroll motion

Warp's components run no code as they load. Scroll motion (`data-flow`) belongs to the page, so the app arms it once, in
`src/entry.client.ts`:

```ts
import { start } from '@weft-js/start/client'
import { flow } from '@weft-js/warp-core'
import * as routes from 'virtual:weft/routes'

flow()
start(routes)
```

Without it the page stays still, with every word in place. Until the first scroll the page holds still and whole, so
the first screen, a crawler and an audit all read every word at full contrast.

The page itself scrolls smoothly by default: in-page anchors and skip links glide, unless the visitor asked for reduced
motion (or the app set `data-motion="reduce"`). A route change still jumps to the top, or to its hash target, at once.
Anchors land below the sticky top bar; a page with a taller header, or none, sets `--warp-scroll-offset`:

```css
:root { --warp-scroll-offset: 96px; }
```

### Scenes behind the page

`@weft-js/warp/scenes` pins one canvas behind the whole page and draws a scene per section on it. Each `<Scene>`
is a section; its scene comes from a renderer's bridge (`defineScene` in `@weft-js/plugin-keel/scene`).

```tsx
import { Scene, Stage } from '@weft-js/warp/scenes'
import { orchard, harbour } from './scenes'

<Stage label="An orchard, then a harbour">
  <Scene use={orchard} poster="#2f4a3a">
    <h2>Orchard</h2>
  </Scene>
  <Scene use={harbour} poster="/harbour.avif">
    <h2>Harbour</h2>
  </Scene>
</Stage>
```

Each scene's position is in viewports since its section began to enter. Its section carries it as
`--scene-position`, so the section's own styles can move with the scene without a second `progress()`. The
stage keeps the active scene and its neighbours built and frees one two away. As a section arrives its scene blends in over `hero` viewports; the
active scene moves at the half-way point. Without a `blend` the stage cuts there. A `governor` sets the levers,
the pixel ratio and the frame rate. A scene's `poster` is pinned behind its section: the first paint, and what
shows without WebGL2.

A `blend` (`keelBlend()` from `@weft-js/plugin-keel/blend`) draws every frame: each `<Scene>` says how it arrives
(`mode="radial"`, a `centre`, `lines={false}`), and the less visible scene is drawn at the levers' `blendScale`.
It also lays the active section's pass over the frame: a paper panel's `progress`, `position`, `tear` and
`colour`, and the `darken` and `blur` under it. Give them as `<Scene post={{ tear: 1 }}>`, as a function of the
position, or from the scene's own tracks. Under reduced motion the scroll moves no hand-over: the active scene
changes at the half-way point with a 300 ms dissolve. A scene with a `hold` (`<Scene hold={1.2}>`, or its scene's
own) stands at that position under reduced motion and where the governor holds scenes still (a low tier),
whatever the scroll.

A poster can be baked: `poster="bake"` shows the still `bakedPosters` holds under the scene's `id`, a wide one
and a tall one as media records. `@weft-js/capture` renders them from the scenes themselves at build time, each
through the blend and at its `hold` where it has one, and writes the module that registers them. `tier` picks what draws: `live` (the default) draws the scenes, `poster`
shows only posters and never loads a renderer, and `auto` shows posters on a phone or tablet and where the
governor rates the device `low`, decided before anything 3D loads.

Once every section's position has caught up with the scroll and the scenes it wants have drawn, the stage writes
the scroll offset on its root as `data-stage-ready` and calls `onReady`: the frame a test or a capture may take.
A driver outside the page reaches the stage through `root[STAGE]` (`Symbol.for('weft.stage')`), a `StageHandle`:
its scenes, `freeze(seconds)` to stop the shared clock and TAA, so that a frame owes nothing to the ones before it,
and `still(index, position)`, which draws one scene alone through the blend and resolves with a PNG of the canvas;
without a position the scene stands at its `hold`. `@weft-js/capture` drives both.

## Component catalogue

Every component exported from `@weft-js/warp`, grouped by what it is for. The docs site has a page for each one with its
props, live examples and keyboard table. `weft plugins` lists the core catalogue in your terminal.

<details open>
<summary><strong>Layout and type</strong></summary>

| Component | Purpose |
|---|---|
| `Stack` | Vertical flow; the gap is the relationship between the children |
| `Row` | A horizontal cluster that wraps; `reflow` makes it a Stack below a step |
| `Grid` | Intrinsic columns: as many as fit at `min`, never more than `cols` |
| `Split` | A fixed side and a fluid main, stacked below its step |
| `Center` | A measured, centred column, with page gutters when `gutter` is set |
| `Cover` | Fills the screen and centres one child (auth and error pages) |
| `Frame` | A fixed-ratio media box |
| `Spacer` | Takes the free space in a Row or Stack |
| `Inset` | A sunken, padded region |
| `Card` | A raised surface; with `href` or `onClick` it is a real link or button |
| `Heading` | A real heading; `level` is the outline, `role` the look |
| `Text` | Text in a role, with `tone`, `subtle` and `faint` |
| `Link` | An underlined link with the underline sweep; `external` says it opens a new tab |
| `Kbd` | One key, such as `<Kbd>⌘</Kbd><Kbd>K</Kbd>` |
| `Code` | Inline code in running text |
| `Icon` | Any Warp icon by name (re-exported from `@weft-js/warp-icons/icon`) |

</details>

<details open>
<summary><strong>Actions and choices</strong></summary>

| Component | Purpose |
|---|---|
| `Button` | A native button in six emphases, with `loading`, `icon` and `collapse` to icon-only on small screens |
| `Toggle` | A toggle button with `aria-pressed` |
| `Chip` | A filter chip: a toggle that draws its check when pressed |
| `Checkbox` | A native checkbox; `indeterminate` is the real property |
| `Radio` | One native radio |
| `RadioGroup` | A set of native radios, so arrows, form values and the group name are the platform's |
| `Switch` | A native checkbox with `role="switch"` that applies at once |
| `Segmented` | Native radios drawn as a segmented control |
| `Slider` | One or more `role="slider"` thumbs with APG keys and a press anywhere on the track |
| `Menu` | A menu button: roving focus, typeahead, Escape back to the trigger |
| `CommandPalette` | A Cmd/Ctrl+K command palette: an APG combobox in a modal dialog |

</details>

<details open>
<summary><strong>Text and rich fields</strong></summary>

| Component | Purpose |
|---|---|
| `Field` | The field shell the other fields are built on, for a control of your own |
| `Input` | A text field; every native input attribute passes through |
| `Search` | A search field with its icon and a clear button |
| `Textarea` | Grows from `rows` to 10 lines; Cmd/Ctrl+Enter submits |
| `NumberField` | A number as real text with `inputmode`, avoiding `type="number"`'s wheel and locale bugs |
| `Select` | A select Warp draws everywhere: a popover on desktop, a sheet on phones, a search once the list is long |
| `CompactSelect` | The same list with no floating label, for table rows, pagers and toolbars |
| `CodeInput` | A code field coloured with the CSS Custom Highlight API, so a key press builds no spans |
| `JsonEditor` | CodeInput for JSON: parse and schema errors name their line; Format rewrites it |
| `KeyValueEditor` | Key, value and remove rows, with an optional Form/JSON switch |
| `MentionsInput` | A plain textarea with trigger characters; the list opens at the caret |
| `RichTextEditor` | A rich text field with an APG toolbar and Markdown shortcuts |
| `MarkdownEditor` | Source and preview side by side, tabs when narrow; Cmd+B, I and K wrap the selection |
| `SignaturePad` | A signature canvas with Undo and Clear; typing the name is the required alternative |
| `PaymentCardInput` | The field shell around a payment provider's hosted card field; Warp never renders card inputs itself |
| `CardNumberText` | A saved card as `•••• 4242`, with its brand and MM/YY expiry |
| `PlaceLookupInput` | A place search; your app supplies `search()`, Warp ships no geocoder |
| `AddressField` | An address whose fields follow the country, with optional autocomplete from a `provider` |
| `PhoneField` | A country button and a native tel input that formats as you type |
| `CountrySelect` | Countries named by `Intl.DisplayNames` in the UI locale, with `preferred` pinned |
| `LanguageSelect` | Languages, each shown with its own name in its own script |
| `CurrencySelect` | Currencies as "Euro · EUR · €" |
| `TimeZoneSelect` | Every IANA zone with its offset at a reference date; Local pinned first |

</details>

<details open>
<summary><strong>Date and time</strong></summary>

| Component | Purpose |
|---|---|
| `DateField` | Date segments with a calendar popover (a sheet on phones); fires only with a complete date |
| `DateRangeField` | Two segment groups, a two-month popover and a preset rail |
| `TimeField` | Time segments in the locale's order, with a slot list (wheels on phones) |
| `DateTimeField` | A date and a time in one control and one popover |
| `DurationField` | A spinbutton per unit with carry; the value is an ISO duration |
| `MonthPicker` | A 3×4 grid of month names with year arrows |
| `WeekPicker` | The month grid with week numbers; a pick covers the whole row |
| `PeriodPicker` | One grid whose granularity switches: year, quarter, month or week |
| `RecurrenceField` | An RRULE editor led by its plain-language summary; rules it can't edit stay untouched |
| `InlineCalendar` | A standalone calendar grid of 1–3 months in `single`, `multiple` or `range` mode |

</details>

<details open>
<summary><strong>Feedback and status</strong></summary>

| Component | Purpose |
|---|---|
| `Alert` | An inline alert; status is carried by icon and words, never colour alone |
| `Badge` | A status or count badge; a count says its unit to screen readers |
| `Tag` | User content as a tag; `onRemove` adds a named remove button |
| `Progress` | Linear or circular progress; indeterminate without a `value` |
| `Spinner` | A spinner; `label` makes it a named status, otherwise it is decorative |
| `Skeleton` | A loading placeholder; still under reduced motion |
| `Shape` | A skeleton shaped like the content a `<Boundary>` is waiting for |
| `Presence` | Shows and hides content with an entrance and an exit that plays out before it leaves |
| `Ticker` | A number that rolls digit by digit, writing one attribute per changed digit |
| `Toaster` | The toast region and its live regions; pair with `toast` |

</details>

<details open>
<summary><strong>Overlays</strong></summary>

| Component | Purpose |
|---|---|
| `Modal` | A modal dialog on native `<dialog>`; `alert` makes it an AlertDialog |
| `Drawer` | A sheet: at the side on wide screens, from the bottom on phones |
| `Popover` | A button that opens a non-modal dialog panel |
| `Tooltip` | A hint on hover and keyboard focus, never essential |

</details>

<details open>
<summary><strong>Navigation and app shell</strong></summary>

| Component | Purpose |
|---|---|
| `Shell` | The app shell: top bar and bottom tabs on a phone, a rail on a tablet, a collapsible sidebar on desktop, by its own width |
| `SideNav` | A docs sidebar whose sections fold and remember; docked from 900px, over the page on phones |
| `SideNavTitle` | The header brand, swapped for the SideNav's title while its panel is open on a phone |
| `Nav` | Links with a sliding bar that follows the route and the pointer |
| `Tabs` | `line`, `pill` or `enclosed` tabs with APG automatic activation |
| `Accordion` | Headers that are real buttons in headings, with arrow, Home and End keys |
| `HamburgerMenu` | A small-screen site menu: the bars become an X and open a full-screen menu |
| `PaginationBar` | Rows per page, range, page buttons and Go to; collapses when narrow |
| `LoadMore` | An infinite-scroll sentinel with a button that is always there as the fallback |
| `ScrollRail` | The page scrollbar, warp's on every device (touch included) in place of the native one, drawn below a sticky header instead of over it; `below=".header"` follows that header's bottom edge as the page scrolls |
| `ScrollView` | A scroll area with Warp's bars, in the DOM or on a canvas, by [`@weft-js/scroll`](https://www.npmjs.com/package/@weft-js/scroll): the browser scrolls, the thumb keeps up on the compositor |

</details>

<details open>
<summary><strong>Data</strong></summary>

| Component | Purpose |
|---|---|
| `Table` | A semantic data table: sort, filter, columns, resize, selection, bulk bar, phone cards |
| `DataGrid` | A Table as an ARIA grid or treegrid: one tab stop, arrow keys between cells, grouping and trees |
| `PivotTable` | Rows by columns by a measure, with heat cells and totals both ways |
| `VirtualList` | A long list with only nearby rows in the DOM; exact heights for text rows |
| `Feed` | A long activity feed on the APG feed pattern; Page Up and Down move between articles |
| `ScrollGrid` | A two-axis window: rows and columns virtualised on one scroller |
| `Markdown` | A small, safe Markdown renderer; raw HTML is escaped |
| `CodeBlock` | Code coloured on the server; hydrates to nothing |
| `Snippet` | One command to copy, with its `$` |

</details>

<details open>
<summary><strong>Charts</strong></summary>

Every chart shares one frame: head, legend, plot with tooltip, a data table and a summary. The plot is laid out on the
server, so the page arrives with a whole chart.

| Component | Purpose |
|---|---|
| `Chart` | The shared frame, for a chart of your own |
| `LineChart` | Lines over a shared x axis |
| `BarChart` | Bars, grouped or stacked |
| `ComboChart` | Bars and lines on one plot |
| `DonutChart` | A ring of parts of a whole |
| `RadialChart` | Concentric arcs, one per value |
| `FunnelChart` | Stages narrowing from first to last |
| `ScatterChart` | Dots at x and y |
| `BubbleChart` | Dots at x and y, sized by a third value |
| `Histogram` | Values binned into equal ranges |
| `HeatGrid` | A grid of cells coloured by value |
| `RadarChart` | Series on axes spread around a circle |
| `Treemap` | Nested rectangles sized by value |
| `Sunburst` | Nested rings sized by value |
| `SankeyChart` | Flows between stages; band width shows the amount |
| `CandlestickChart` | Open, high, low and close per period |
| `BoxPlot` | Quartiles and whiskers per group |
| `WaterfallChart` | A running total, each step a rise or a fall |
| `StreamChart` | A rolling live window; pausing holds it and shows it as a table |
| `BrushChart` | A long series with a window dragged over it |
| `TileMap` | Regions drawn as equal tiles |
| `GaugeChart` | One value on an arc between its bounds |
| `Sparkline` | A tiny trend line with no axes, for inside a labelled parent |

</details>

<details>
<summary><strong>Canvas and dither</strong></summary>

| Component | Purpose |
|---|---|
| `Canvas` | A canvas that handles pixel ratio, resize, off-screen and reduced motion |
| `CanvasStage` | A canvas that paints the page laid out inside it; elements keep their focus, typing and semantics |
| `StageSelect` | A select-only combobox drawn by a stage |
| `Dither` | A still image or gradient dithered to Warp's inks |
| `DitherField` | A live dithered field: moves at vivid and balanced, still at quiet and under reduced motion |
| `DitherGlyph` | A word or logo woven out of a dithered field |
| `DitherStage` | A CanvasStage in the dither look |

`LEVEL` and `PAINTERS` are the dither tone levels and the built-in skins.

</details>

<details>
<summary><strong>AI chat (agent pack)</strong></summary>

| Component | Purpose |
|---|---|
| `Conversation` | The chat log: keyed turns, an optional app bar and the Prompt below |
| `UserMessage` | The user's turn, with edit and copy |
| `Assistant` | The assistant's turn, rendered from the folded answer; `aria-busy` until done |
| `Reasoning` | A native `<details>` that says "Thinking…" while streaming, then folds and keeps the duration |
| `ToolCall` | A tool call card: running, done, failed, or awaiting approval with editable arguments |
| `Cite` | A citation link with a preview on hover and focus |
| `Sources` | Numbered source cards matching the cites |
| `Prose` | Safe answer text: paragraphs, lists, code fences, inline code and cites |
| `AgentPlan` | The task list and the queue of messages sent during a run |
| `Prompt` | The composer: grows to 8 lines, Enter sends, Escape stops |
| `ModelPicker` | A model chip opening a listbox grouped by provider, with capabilities and cost |
| `MessageActions` | Copy, good and bad answer, regenerate and branch |
| `BranchSwitcher` | `‹ 2/2 ›` for a turn with more than one version |
| `Suggestions` | Starter prompts on an empty chat, chips after a turn |
| `Question` | The run pauses and asks: radios or checkboxes and optional free text |
| `Checkpoint` | A labelled hairline with Restore |
| `Shimmer` | Placeholder text with a light passing over it |
| `ContextMeter` | A ring showing context use, caution at 80% and critical at 95% |
| `TraceViewer` | Nested spans on a shared time axis, as an APG treegrid |
| `ArtifactPanel` | Preview, Code and Versions tabs for a generated artifact |
| `SpeechInput` | Mic picker, input level and Record/Stop on one button |

`foldAnswer` (from warp-core) folds a stream of agent events into the answer `Assistant` renders.

</details>

<details>
<summary><strong>Scheduling (schedule pack)</strong></summary>

| Component | Purpose |
|---|---|
| `Calendar` | Month, Week, Day, Agenda, Timeline and Year views; drag to move, resize and create on a 15-minute snap |
| `EventPopover` | The event card, a non-modal dialog on the event |
| `EventEditor` | The event editor sheet: the fields path for every drag |
| `MoveSheet` | A bottom sheet with day, start and duration: the touch path for a drag |
| `Agenda` | The phone agenda: a week strip, swipeable day pages and free-time gaps |
| `AgendaDay` | One day's list of rows |
| `YearView` | Twelve mini months with density dots and one roving stop |
| `BookingCalendar` | A calendar plus slot buttons and a confirm step |
| `MeetingPlanner` | Attendees, an availability table and three suggested times |
| `AvailabilityEditor` | Weekly From/To ranges per weekday, with date overrides |

</details>

<details>
<summary><strong>Realtime and notifications (live pack)</strong></summary>

| Component | Purpose |
|---|---|
| `Bell` | An icon button with a count badge; its name says the count |
| `Inbox` | Notifications in tabs, grouped by day, patched in place by key |
| `ActivityFeed` | Actor, verb, object and time, grouped per day |
| `PushSoftAsk` | An in-app card before the browser's push permission prompt |
| `ConnectionPill` | One pill for a live connection's state, announced once per change |
| `ConnectionBanner` | A banner that appears only when reconnecting drags on or the app is offline |
| `LiveStatus` | The realtime pill: quiet while live, loud only in trouble |
| `NotificationPreferences` | Event by channel toggles in one APG grid, with tri-state group toggles |
| `TransportPicker` | A dev-only realtime sandbox for picking and testing the wire and bus |
| `MeetingRoom` | A video call: header, stage in four layouts, sidebar and controls |
| `ControlBar` | The call's controls as an APG toolbar |
| `Tile` | One participant tile with a name chip and level bars |
| `Prejoin` | Camera preview, mic meter and device selects before joining |
| `Lobby` | Waiting to be let in |
| `ScheduledLobby` | A countdown with Join disabled until the meeting can start |
| `Countdown` | A `role="timer"` countdown, announced once at one minute |

`notify()` applies the inbox's toast policy on top of `toast`.

</details>

<details>
<summary><strong>Collaboration (collab pack)</strong></summary>

| Component | Purpose |
|---|---|
| `Thread` | A chat channel on a virtual window, so 100,000 messages cost what 20 do |
| `Message` | One chat message with reactions, replies and delivery state |
| `Composer` | The chat composer with quote draft, attachments and @mentions |
| `TypingIndicator` | "Mei is typing…", still under reduced motion |
| `ConversationList` | Channels as a listbox with one tab stop |
| `Kanban` | A board whose columns are windows, with WIP limits; cards move by drag, keyboard or a Move menu |
| `CommentThread` | A comment thread with reply and Resolve |
| `CommentAnchor` | The highlighted range a thread hangs from |
| `CommentRail` | The margin rail of anchored threads; a bottom sheet on phones |
| `Cursors` | Peer cursors with name chips in each peer's colour |
| `PeerMark` | A peer's selected text, tinted in their colour |
| `PeerSelection` | A peer's selection on an object, outlined with their name |
| `PresenceStack` | Who is here, as avatars, with joins and leaves announced as one summary |
| `Following` | Wraps a surface that follows a peer's viewport until you scroll or press Escape |
| `ViewportRail` | A rail of the document with a box per peer's viewport |
| `SectionPeers` | Who is reading a section, beside its heading |
| `AutoTrack` | Follows the presenter's section; a manual scroll pauses it |
| `LockIndicator` | "Kofi is editing" on a field another peer holds |
| `LockedField` | A text field held by a peer: read-only, still readable and focusable |
| `SyncedForm` | Every named control inside is shared; a focused field is never overwritten |
| `SyncIndicator` | "Saved", "Saving…" or "Offline · changes kept" |
| `ConflictAlert` | Both versions side by side with Use theirs, Keep mine and Compare |
| `ShareDialog` | Invite people, set roles and link access, copy the link |
| `VersionHistory` | Named versions with a read-only preview and Restore |
| `DataIntegrity` | A dev-tools panel for a channel: duplicates, out-of-order and lag |

</details>

<details>
<summary><strong>Auth, onboarding and system pages (flow pack)</strong></summary>

| Component | Purpose |
|---|---|
| `Flow` | A step machine: the old step exits, the new one enters from its side, focus moves to its title |
| `AuthScreen` | The auth layout: full-bleed, card or split with a brand panel, by its own width |
| `SignIn` | Passkey and SSO, email and password, remember and Forgot |
| `SignUp` | Name, email, password with strength and rules, terms |
| `PasswordMeter` | Password strength and a rules list, each rule in words |
| `OtpField` | One real input painted into cells: one tab stop, paste and SMS autofill work |
| `OtpStep` | The MFA step: auto-submit on the last digit, resend with a countdown |
| `MagicLinkSent` | "Check your inbox" with resend on a countdown |
| `ResetPassword` | Email, link or code, then a new password; never reveals whether an account exists |
| `InviteAccept` | Who invited you, the org and role, Join and Decline |
| `AuthDone` | A done mark, then the flow continues |
| `ReauthDialog` | A password or passkey check before a sensitive action |
| `PasskeyButton` | Sign in with a passkey |
| `SsoButtons` | Provider buttons, each pending until the app redirects |
| `MfaSetup` | QR and key, confirm a code, backup codes |
| `SignGate` | A page behind a signature; the page is inert until signed |
| `SignGateBadge` | The gate's status |
| `Checklist` | An onboarding checklist with a counter and progress rail |
| `Tour` | A product tour with a spotlight; a missing target skips its step |
| `Coachmark` | One tip with a beacon and no scrim |
| `SystemPage` | A result page (404, 500, no access) inside the app shell |
| `ConnBanner` | Offline, reconnecting and stale-deploy banners under the header |
| `RateLimited` | A rate-limit notice with a draining rail |
| `ShortcutsOverlay` | `?` opens a filterable, platform-aware list of registered shortcuts |

`useCooldown(seconds, onDone)` counts a resend timer down to zero.

</details>

<details>
<summary><strong>Admin, billing and commerce (admin pack)</strong></summary>

| Component | Purpose |
|---|---|
| `SettingsLayout` | Settings sections with a nav that becomes a sticky column when wide |
| `SettingsSection` | A heading, a line and a bordered group of rows |
| `SettingRow` | Label and help at the start, the control at the end; stacks when narrow |
| `SaveBar` | A dock that rises when values differ from their snapshot |
| `DangerZone` | The one critical-bordered section |
| `ConfirmDialog` | A plain AlertDialog with focus on Cancel |
| `TypeToConfirm` | An AlertDialog that stays disabled until the right text is typed |
| `MembersTable` | Members with inline role select, bulk bar and pending invites |
| `SeatsMeter` | "7 of 10 seats used" |
| `RolesMatrix` | What each role can do; editable with `onToggle` |
| `InviteDialog` | Invite by email with a role, checked against the seats left |
| `TagsInput` | Enter, comma or a pasted list adds tags; invalid ones stay marked |
| `ApiKeys` | API keys: create behind re-auth, show the key once |
| `PlanPicker` | Plans as radio cards with Monthly/Annual and a proration preview |
| `UsageMeter` | A usage meter: caution from 80%, critical at 100% |
| `UsageMeters` | A group of usage meters |
| `Invoices` | Invoices, with a banner when a payment failed |
| `PaymentMethods` | Saved cards by last four; remove gives Undo |
| `PayFrame` | A styled slot for a payment provider's iframe |
| `AuditLog` | Who did what and when, filtered and exportable |
| `IntegrationsGrid` | Integration cards with status and one action each |
| `Webhooks` | Webhook endpoints with Send test and one-time signing secrets |
| `CsvImport` | Upload, map, review and import a CSV |
| `CartDrawer` | The cart as a sheet with subtotal and Checkout |
| `CartButton` | The cart button with a count badge, said in words |
| `LineItem` | One cart line with a quantity stepper |
| `Checkout` | Cart, address, shipping, payment, review and confirmation, guest first |
| `OrderConfirmation` | The order number, where the receipt went and the tracker |
| `OrderTracker` | Ordered, packed, shipped, delivered |

</details>

## Theming

The look comes from tokens, so every component follows the theme, the density and the expression dial with no change to
your code. There are three levels. Stop at the first that gets you there; each keeps the contrast check.

1. **`warp({ … })` in `weft.config.ts`.** Checked by D010 at build time.
2. **`src/theme.css`, unlayered.** `[data-scope]` and `[data-part]` rules beat Warp with no `!important`.
3. **Your own component**, built on Warp's tokens.

```ts
warp({
  seed: { accent: '#e8590c' }, // the hue; each theme solves lightness
  dials: { expression: 'vivid', density: 'cozy' },
  radius: 'round', // sharp, soft or round
  fonts: { display: 'Fraunces, serif' },
  colors: { brand: '#e8590c' }, // --warp-color-brand, tone="brand"
  parts: { button: { radius: 999, case: 'uppercase' } },
  // a named theme, under data-palette="ocean"
  themes: { ocean: { seed: { accent: '#0b7285' } } },
})
```

### Options

| Option | Type / values | Default | What it does |
|---|---|---|---|
| `seed.accent` | `#rrggbb`, a name from `colors`, or `{ hue, chroma }` | Warp's accent | The hue family. Each theme solves its own lightness, and the build prints where it landed |
| `seed.neutral` | `#rrggbb` or `{ hue, chroma }` | warm paper and ink | Tints pages, surfaces and text |
| `dials.expression` | `quiet` · `balanced` · `vivid` | `balanced` | How much motion and colour the kit shows |
| `dials.density` | `compact` · `cozy` · `comfortable` | `cozy` | Spacing and control height |
| `dials.flair` | `sweep` · `none` | per expression | Where the sweep runs: `sweep` adds buttons and surfaces; `none` keeps it to inputs and controls |
| `dials.theme` | `light` · `dark` | follows the OS | With `light`, dark isn't checked |
| `dials.palette` | a name from `themes` | | The named theme a page shows by default |
| `fields` | `floating` · `classic` | `floating` | Where field labels sit |
| `radius` | `sharp` (2px) · `soft` · `round` | per expression | Replaces the radius each expression sets |
| `fonts` | `{ body, display, mono }` | system stacks | A family name or a full CSS stack |
| `tokens` | `{ '--warp-…': value }` | | Any spec token, on every scope. Colours are `#rrggbb`, `oklch()`, `color-mix()` or `light-dark()` |
| `colors` | `{ name: '#rrggbb' }` | | Named colours: `--warp-color-<name>`, a tone (`tone="brand"`), and Tailwind's `bg-brand` |
| `system` | `radius` `space` `pad` `control` `font` `shadow` `duration` `ease` `border` `icon` `text.<role>` | | Retunes the scales every part reads. Numbers are px, ms for durations |
| `parts` | `{ part: { …props, hover, focus, press, active, open, disabled } }` | | Restyles one element, at rest and per state |
| `themes` | `{ name: { seed, colors, system, parts, tokens } }` | | Named looks under `[data-palette="name"]` |

### Parts

Every part takes `bg text border borderWidth radius padding paddingX paddingY gap margin height minHeight width size
shadow opacity scale duration easing font fontSize weight leading tracking case`. Numbers are px; names are system steps
or names from `colors`.

| Part | For |
|---|---|
| `button`, `button.soft`, `button.outline`, `button.ghost`, `button.frame`, `button.link` | Button and ButtonLink, per emphasis |
| `iconButton` | A button holding only an icon |
| `copy`, `close` | CopyButton, and the close button of dialogs, sheets, alerts and side navs |
| `link`, `link.underline` | Link and its drawn underline (`color` `width` `offset`) |
| `nav`, `nav.item`, `nav.underline` | Nav and its sliding bar |
| `tabs`, `tabs.tab`, `tabs.underline` | Tabs |
| `pill`, `badge`, `chip` | Pill, Badge and Chip |
| `card` | Card and Surface |
| `field`, `field.label` | Text fields, selects and pickers |
| `sweep` | The sweep stroke (`stroke` `base` `text` `width` `duration`) |
| `dialog`, `sheet`, `popover`, `toast` | Overlay panels |

```ts
warp({
  colors: { brand: '#e8590c', ink: '#1b1b1f' },
  parts: {
    button: {
      bg: 'brand',
      text: 'ink',
      radius: 'pill',
      hover: { bg: 'ink', text: 'white' },
    },
    sweep: { stroke: 'brand', width: 2 },
    nav: {
      item: { hover: { text: 'brand' } },
      underline: { color: 'brand', width: 3 },
    },
  },
  themes: {
    ocean: {
      seed: { accent: '#0b7285' },
      colors: { brand: '#0b7285' },
    },
  },
})
```

A solid's `bg` and `text` move its tone channels, so hover and sweep follow. Text set on a fill in the same part is
checked like a seed: below 4.5:1 is D010.

### Switching at run time

```ts
import { getDial, setDial, setPalette } from '@weft-js/warp'

// Kept for the next visit; see dialScript
setDial('theme', 'dark', { persist: true })
setDial('density', 'compact')
// A theme from warp({ themes }); 'auto' goes back to the default
setPalette('ocean')
getDial('expression') // 'balanced'
```

Dials are `expression`, `fields`, `theme`, `density`, `motion` and `flair`. Each change is announced as a `warp:dial`
event on the document. Any element can set a dial with a `data-*` attribute, and scopes nest:

```tsx
<section data-theme="dark" data-density="compact">…</section>
```

### An exact brand colour

A seed gives the hue, not the colour. To pin a brand fill, set it and its hover for both themes:

```ts
warp({
  seed: { accent: '#c8102e' },
  tokens: {
    '--warp-color-accent-solid': 'light-dark(#c8102e, #e5484d)',
    '--warp-color-accent-solid-hover': 'light-dark(#a50d26, #f2666a)',
  },
})
```

`weft docs theme` prints every option, part and state, plus worked looks (brutalist, warm editorial) and Button's tone
channels. Its source is
[packages/cli/docs/theme.md](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/theme.md). `weft tokens`
writes the resolved tokens as DTCG 2025.10 for Figma, Style Dictionary or Terrazzo.

## The Theme studio

The docs site has a Theme studio at `/components/theme-studio` (Components → Theming → Theme studio). Every control
writes a key of `warp()`, and the preview runs Warp's own theme compiler from `@weft-js/warp/theme`, so what you see is
what your build ships.

- Start from a preset, then adjust colour, shape, type, space and motion with sliders and colour pickers.
- Edit any part in any state, or any `--warp-*` token, or the raw JSON.
- Real components take the theme live, with their contrast ratios. Part text below 4.5:1 is flagged, as the build
  would flag it.
- Copy the result as `weft.config.ts`.

Source: [site/src/routes/components/theme-studio.tsx](https://github.com/Ravonus/weft/blob/main/site/src/routes/components/theme-studio.tsx).

## Accessibility

What Warp guarantees, and what checks it:

| Guarantee | How |
|---|---|
| **Every control has a name** | `label` is a required `string` on every field, `caption` on Table, and `label` on an icon-only Button. Badges say their unit in `srText`. Icons are `aria-hidden` unless given a `label` |
| **Keyboard patterns** | Tabs, Menu, Accordion, Slider, RadioGroup, Select, CommandPalette, DataGrid, TraceViewer, ControlBar and the rest follow the WAI-ARIA Authoring Practices: one tab stop, arrows inside, Home and End, typeahead where it applies |
| **Focus is managed** | Dialogs and sheets move focus in and return it to the opener on every close path. Layers stack, so Escape closes only the top one. Flow steps move focus to the new step's title |
| **Status isn't colour alone** | Alerts, tool calls, password rules and meters carry an icon and words |
| **Contrast is checked at build** | D010 fails a seed, colour, token or part that drops any text, control boundary or focus ring pair below WCAG at a theme × expression stop |
| **Reduced motion** | The `motion` dial and `prefers-reduced-motion`: loops become an opacity pulse or stop, and entries run at most once |
| **Live regions** | Toasts, connection state, presence changes and new messages announce once, summarised in bursts |

Behind those claims, in this repo:

- `pnpm run a11y` runs axe-core (WCAG 2.0–2.2 A/AA and best practice, colour contrast included) in Chromium over every
  component at all 12 dial stops: expression × theme × motion. At `motion: reduce` it also fails any loop that still
  moves anything but opacity. It measures contrast from pixels as well.
- warp-core's contrast checker resolves every colour token at each theme × expression and checks text, UI and focus-ring
  pairs. The plugin runs the same checker on your config.
- In an app with Warp, `weft check` reports D001–D007 (raw values and browser-painted controls) and D030–D039 (missing
  labels and names, focus rings removed, positive `tabindex`, heading jumps). `weft docs design` lists them.

## Tailwind

Warp works with Tailwind v4. In an app that has Warp, `weft add tailwind` installs Tailwind and writes this at the top of
`src/app.css`:

```css
@layer warp, theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@import "@weft-js/warp/tailwind.css";
```

Tailwind's reset is left out on purpose: its `base` layer comes after `warp` and would override every component. Warp
brings its own base.

`@weft-js/warp/tailwind.css` maps Warp's tokens to Tailwind theme values with `@theme inline`, so each utility stays on
the `var()` and follows dials and scopes:

| Utility family | Values |
|---|---|
| Colours | `page` `surface` `surface-raised` `surface-sunken` `text` `text-subtle` `text-faint` `border` `border-strong` `focus` `accent` `accent-soft` `accent-text` `on-accent` `positive` `caution` `critical` `info` |
| Fonts | `font-sans` `font-display` `font-mono` |
| Spacing | `hair` `tight` `related` `group` `section` `page` (`p-related`, `gap-group`) |
| Radius | `rounded-mark` `rounded-control` `rounded-surface` |

A numeric spacing class off that scale, such as `p-3`, is D002. Names from `warp({ colors })` also become utilities
(`bg-brand`) through `.weft/tokens/warp.tailwind.css`.

## Per-page cost

- **Per component CSS.** Each component imports only its own stylesheet from warp-core's split CSS.
  `package.json` `sideEffects` lists only CSS and three modules, so an unused component tree-shakes away.
- **Shared once per page.** What components share (the sweep, Weft's spread helpers, Icon) is paid once per page, not
  per component.
- **Measure it.** `pnpm run size` in this package builds each component alone with the Weft plugin and reports brotli
  (q11) JS and CSS three ways: alone, ten on one page, and what it adds to a page that already renders every other
  component.
- **App ceiling.** The release gate `evals/gates/warp-exit.mjs` rebuilds the eval shop on Warp and checks its JS and
  CSS together against a 50 KB brotli ceiling.
- **Icons.** An icon you don't import costs nothing. See
  [`@weft-js/warp-icons`](https://www.npmjs.com/package/@weft-js/warp-icons) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp-icons)</sup>.
- **Work per interaction.** `test/budget.test.tsx` caps the DOM mutations and reactive re-runs each component may spend
  on one interaction.

## API reference

### Entries

| Import | What it has |
|---|---|
| `@weft-js/warp` | Every component in the catalogue, plus `toast`, `setDial`, `getDial`, `setPalette`, `getPalette`, `sweep`, `compareRange`, `foldAnswer`, `notify`, `useCooldown`, `LEVEL`, `PAINTERS`, and the prop and data types |
| `@weft-js/warp/plugin` | `warp()` (also the default export), `dialScript`, `checkSeed`, `dtcg`, `classicCss`, `dialCss` |
| `@weft-js/warp/theme` | The theme compiler without Node, used by both the plugin and the Theme studio: `themeOptions`, `themeCss`, `partContrast`, `checkTokens`, `normalizeSeed`, `seedByName`, `tailwindTheme`, `toneChannels`, `PARTS` |
| `@weft-js/warp/theme-parts` | The table of parts, their states and where each property lands |
| `@weft-js/warp/theme-context` | `themeContext()`: facts read from warp-core's stylesheet. Node only |
| `@weft-js/warp/skeleton` | The skeleton CSS, for a page that uses `<Boundary pending="shape">` without a `<Skeleton>` |
| `@weft-js/warp/scenes` | `<Stage>` and `<Scene>`: one WebGL canvas pinned behind the page, a scene per section |
| `@weft-js/warp/ui` | How Warp draws an `interaction()` row. The Weft plugin imports it where `ui=` is used |
| `@weft-js/warp/tailwind.css` | Warp's tokens as Tailwind v4 theme values |

### Non-component exports

| Export | What it does |
|---|---|
| `toast.show(input)` | Shows a toast; `input` is `{ title, description, tone, action, duration, id }`. Returns its id |
| `toast.dismiss(id)` | Dismisses one toast |
| `toast.promise(p, { pending, done, error })` | One toast through a promise's life. Returns the promise |
| `setDial(name, value, { root, persist, transition })` | Writes a dial and announces `warp:dial` |
| `getDial(name, root?)` | Reads a dial |
| `setPalette(name, { root, persist })` | Switches the named theme; `'auto'` returns to the default |
| `getPalette(root?)` | Reads the named theme, or `'auto'` |
| `sweep` | The sweep as an action, for a binding that wants to name it |
| `compareRange(range, compare)` | The comparison range of a date range selection, for a dashboard's "vs" |
| `foldAnswer(events)` / `foldAnswer(answer, event)` | Folds agent events into the answer `Assistant` renders |
| `notify({ open })` | The inbox's toast policy on top of `toast` |
| `useCooldown(seconds, onDone?)` | A countdown for resend buttons |

## Recipes

**A dark, compact admin region inside a light page**

```tsx
;<Card
  title="Server logs"
  data-theme="dark"
  data-density="compact"
>
  <Table
    caption="Recent requests"
    columns={columns}
    rows={rows}
  />
</Card>
```

**Classic labels for one form only**

```tsx
<Input label="Street" variant="classic" />
```

**A theme switcher that remembers**

```tsx
import { state } from '@weft-js/core'
import { Segmented, getDial, setDial } from '@weft-js/warp'

export function ThemeSwitch() {
  const theme = state(getDial('theme'))
  const choose = (v: string) => {
    theme.value = v
    setDial('theme', v, { persist: true })
  }
  return (
    <Segmented
      label="Theme"
      value={theme.value}
      onChange={choose}
      options={[
        { value: 'auto', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
    />
  )
}
```

Add `dialScript` to `site.head` so the saved choice applies before the first paint.

## Troubleshooting

**`D010 warp colours fail contrast (n pairs): …`.** A seed, colour, token or part leaves a pair below WCAG at some
dial stop. The message lists each pair with its ratio and the minimum. Change the named token or seed, or limit the
stops with `dials` (for example `dials: { theme: 'light' }` stops dark from being checked). `weft build` stops on it,
because a refused config would ship Warp's default look.

**`warp: accent #… landed as … light, … dark`.** Not an error. A seed sets the hue family and each theme solves its own
lightness to pass contrast. To pin an exact brand colour, set `--warp-color-accent-solid` (see
[An exact brand colour](#an-exact-brand-colour)).

**`unknown option \`…\`` or `must be one of …`.** `warp()` validates every key and value and reports the path, such as
`dials.expression`.

**My `:root { --warp-color-… }` override disappears in some places.** A colour set in plain CSS on `:root` skips the
check and is undone inside any scope that sets a dial, such as a Table's density. Put app-wide values in
`warp({ tokens })` instead.

**Toasts never appear.** `toast.show()` needs one mounted `<Toaster />`.

**Nothing animates on scroll.** Call `flow()` from `@weft-js/warp-core` once in `src/entry.client.ts`.

**Tailwind utilities override Warp components.** Tailwind's full import includes its reset in a later layer. Use the
layered imports from [Tailwind](#tailwind), which `weft add tailwind` writes for you.

**D005 on a `<button>` or `<select>`.** In an app with Warp, a browser-painted control is reported so the page keeps one
look. Use the Warp component; `weft fix` applies the suggested edit for a button. To keep one site, put
`// weft-allow D005: <reason>` on the line above.

## Related packages

| Package | What it is |
|---|---|
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/core)</sup> | The runtime, compiler binding, Vite plugin and test utilities |
| [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/start)</sup> | File routes, server functions, streaming SSR, a database and auth |
| [`@weft-js/cli`](https://www.npmjs.com/package/@weft-js/cli) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/cli)</sup> | The `weft` command: `add`, `check`, `docs`, `tokens` and the rest |
| [`@weft-js/warp-core`](https://www.npmjs.com/package/@weft-js/warp-core) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp-core)</sup> | Warp's behaviour, tokens and CSS, with no framework |
| [`@weft-js/warp-icons`](https://www.npmjs.com/package/@weft-js/warp-icons) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp-icons)</sup> | 651 original icons in Warp's three expression tiers |
| [`@weft-js/create`](https://www.npmjs.com/package/@weft-js/create) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/create)</sup> | `npm create @weft-js`: a new app with Warp by default |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). The repo is one pnpm workspace. In
`packages/warp`:

```bash
# Vitest: markup, hydration, budgets, plugin and theme
pnpm test
pnpm run size    # what each component costs, brotli
pnpm run a11y    # axe-core in Chromium at all 12 dial stops
```

The design spec Warp implements is in
[docs/design/warp](https://github.com/Ravonus/weft/tree/main/docs/design/warp).

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
