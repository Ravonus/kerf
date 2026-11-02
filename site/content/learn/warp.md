# Using warp

:::learn
- What `@weft-js/warp` and `@weft-js/warp-core` are, and when to use each
- How to import components and set up the `warp()` plugin
- How to compose forms, dialogs, menus and tables from warp's pieces
- How to style a component's insides through `data-scope` and `data-part`
:::

warp is weft's UI toolkit: buttons, fields, dialogs, menus, tables, charts and larger blocks like a sign-in flow or a
settings page, with keyboard and screen reader support built in. It comes in two layers. `@weft-js/warp-core` is the
behaviour (focus, keyboard, overlays, motion) and the CSS, in plain TypeScript with no framework. `@weft-js/warp` is the
weft components on top of it.

In React you would pick a component library, a headless library and a styling approach, then wire them together. In
weft that choice has a default: a new app starts with warp (`--ui warp`), and [Styling](/learn/styling) covers the other
starting points.

:::demo ui-kit

## Importing components

Import what you use from `@weft-js/warp`. A page pays only for the components it renders: each one imports its own CSS
and behaviour, so a page with a button doesn't load the table.

```tsx
import { state } from '@weft-js/core'
import { Badge, Button, Card } from '@weft-js/warp'

export default function Product() {
  const inCart = state(0)
  return (
    <Card eyebrow="Coffee" title="House blend, 250 g">
      <p>In cart <Badge count>{inCart.value}</Badge></p>
      <Button onClick={() => inCart.value++}>Add to cart</Button>
    </Card>
  )
}
```

Components are ordinary weft components: they take props, read state, and run once. Props that pass a value in, like
`checked` or `value`, are live, so `checked={done.value}` keeps the switch in step with `done`.

## The `warp()` plugin

The components bring their CSS; the plugin brings the app's tokens and defaults. An app made with `--ui warp` already has
it in `weft.config.ts`:

```ts
import { defineConfig } from '@weft-js/core/config'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({
  plugins: [
    warp({
      seed: { accent: '#0a7d4f' },
      dials: { expression: 'balanced', density: 'cozy' },
      radius: 'soft',
      fields: 'classic',
    }),
  ],
})
```

Every option is optional, and `warp()` with none gives warp's own look:

- **`seed`**: your brand accent, as `{ accent: '#rrggbb' }` or `{ hue, chroma }`. warp derives every accent token from it
  and checks each text and fill pair for contrast at every dial stop. A pair that can't pass is D010, and the build stops.
- **`dials`**: the app's default `expression`, `density`, `flair` and `theme`. A `data-*` attribute on the page or any
  element still wins.
- **`radius`**: `sharp`, `soft` or `round`, in place of what each expression sets.
- **`fields`**: `classic` puts every field's label above it; the default, `floating`, draws it in the border.
- **`fonts`** and **`tokens`**: a family for `body`, `display` or `mono`, and any `--warp-*` token by name. Both go
  through the same contrast check.

[Theming](/learn/theming) shows what the dials do, and [Fonts](/learn/fonts) how to load the faces you name.

## Name what it is

Pick a component by what the thing is, and set its props by what they mean. `Button` has no `color` or `padding` prop.
It has `tone` (what the action means: `neutral`, `accent`, `positive`, `caution`, `critical`, `info`), `emphasis` (how
much weight it carries: `solid`, `soft`, `outline`, `ghost`, `frame`, `link`) and `size` (`sm`, `md`, `lg`):

```tsx
import { Button, Row } from '@weft-js/warp'

export function Danger() {
  return (
    <Row gap="tight" justify="end">
      <Button emphasis="ghost" tone="neutral">Cancel</Button>
      <Button tone="critical">Delete project</Button>
    </Row>
  )
}
```

The look comes from tokens, so it follows the theme, the density and the expression dial with no change to your code.
The same names (`tone`, `emphasis`, `size`, the space steps) run through every component, the layout primitives and
style groups, so once you know them for `Button` you know them for `Badge`, `Alert` and `Chip`.

:::pitfall One solid button per region
Two solid `Button`s side by side compete for the same attention, and `weft check` reports it as D038. Make the main
action solid and the others `soft`, `outline` or `ghost`. The reader should see at a glance which button finishes the
task.
:::

## Composing a form

A form is warp's fields inside an ordinary `<form>`. Each field takes a required `label` (its accessible name), and
`hint` and `error` for the words under it. Layout comes from `Stack` and `Row`:

```tsx
import { derived, state } from '@weft-js/core'
import { Button, Card, Checkbox, Input, Row, Stack } from '@weft-js/warp'

export function Billing() {
  const email = state('')
  const tried = state(false)
  const problem = derived(() => (tried.value && !email.value.includes('@') ? 'Enter an email address.' : undefined))
  const save = (e: Event) => {
    e.preventDefault()
    tried.value = true
  }
  return (
    <Card title="Billing">
      <form onSubmit={save} noValidate>
        <Stack gap="related">
          <Input label="Billing email" type="email" error={problem.value} value={email.value} onInput={e => (email.value = e.currentTarget.value)} />
          <Checkbox defaultChecked>Send a receipt for every payment</Checkbox>
          <Row gap="tight" justify="end">
            <Button emphasis="ghost" tone="neutral" type="reset">Reset</Button>
            <Button type="submit">Save</Button>
          </Row>
        </Stack>
      </form>
    </Card>
  )
}
```

`error` marks the field invalid (`aria-invalid`) and ties the message to it, so a screen reader reads both together.
The fields are native inputs underneath, so they post with the form, autofill works, and `name`, `required` and
`autocomplete` pass straight through. [Forms and validation](/learn/forms-and-validation) shows the server side.

## Dialogs and menus

Overlays take their open state as a box. You pass the box itself, not its value, because the dialog writes `false` to it
when the user closes it with Escape, the backdrop or a `data-close` button:

:::demo style-dialog

```tsx
import { state } from '@weft-js/core'
import { Button, Menu, Modal, Text } from '@weft-js/warp'

export function Project() {
  const confirming = state(false)
  return (
    <>
      <Menu
        label="Actions"
        items={[
          { label: 'Rename', icon: 'pencil' },
          { separator: true },
          { label: 'Delete', icon: 'trash', tone: 'critical', onSelect: () => (confirming.value = true) },
        ]}
      />
      <Modal
        open={confirming}
        alert
        title="Delete this project?"
        footer={
          <>
            <Button emphasis="ghost" tone="neutral" data-close="" autofocus>Cancel</Button>
            <Button tone="critical" onClick={() => (confirming.value = false)}>Delete</Button>
          </>
        }
      >
        <Text subtle>Its deploys and logs go with it.</Text>
      </Modal>
    </>
  )
}
```

`Menu` is a menu button: arrows move through the items, letters jump to one, Escape closes it and puts focus back on the
trigger. `Modal` moves focus inside when it opens (to an `autofocus` element, or the title) and back to whatever opened
it when it closes. `alert` makes it an alert dialog, which a backdrop press doesn't dismiss. `Drawer` takes its `open` box
the same way; `Popover`, like `Menu`, brings its own trigger button and keeps its open state to itself. [Accessibility](/learn/accessibility) has the details of what each one handles.

:::pitfall Pass the box, not `.value`
`open={confirming.value}` hands the dialog a plain `true` or `false`. It can show it, but when the user presses Escape it
has nowhere to write `false`, and the next time you set `confirming.value = true` nothing changes because the box
already holds `true`. Pass `open={confirming}`.
:::

## Tables

`Table` takes rows and column definitions. Sorting, filtering, paging, selection, row details and phone cards are props,
not code you write:

:::demo style-table

```tsx
import { state } from '@weft-js/core'
import { Table } from '@weft-js/warp'
import type { Column, TableSort } from '@weft-js/warp'

type Bean = { id: string; name: string; origin: string; price: number }

const BEANS: Bean[] = [
  { id: 'h', name: 'House blend', origin: 'Brazil', price: 12 },
  { id: 'y', name: 'Yirgacheffe', origin: 'Ethiopia', price: 18 },
]

const COLUMNS: Column<Bean>[] = [
  { id: 'name', header: 'Coffee', rowHeader: true, sort: true, card: 'title' },
  { id: 'origin', header: 'Origin', sort: true },
  { id: 'price', header: 'Price', numeric: true, sort: true, cell: b => `$${b.price}` },
]

export function Beans() {
  const sort = state<TableSort | undefined>({ id: 'name', dir: 'ascending' })
  return <Table caption="Coffee in stock" rows={BEANS} columns={COLUMNS} sort={sort} filter="Filter coffee" />
}
```

`caption` is required: it names the table for screen readers, and `captionHidden` hides it on screen only. `rows` can be
an array, a box, a `derived`, or a `resource`, in which case the table shows its own loading, empty and error states.
In a container under 480 px wide a table stacks each row as a card, with `card` placing a column on it; the demo above
sits in a narrow pane, so it passes `phone="columns"` to keep its headers and scroll sideways instead.
For a spreadsheet-like grid with editing and pinned columns there is `DataGrid`, and for very long lists `VirtualList`.

## Finding the right component

The site's toolkit pages list every component with its props, live examples and a keyboard table. Some places to start:

- Actions: [Button](/components/button), [Toggle](/components/toggle), [Menu](/components/menu),
  [CommandPalette](/components/command-palette)
- Forms: [Input](/components/input), [Select](/components/select), [Checkbox](/components/checkbox),
  [Switch](/components/switch), [Segmented](/components/segmented), [Slider](/components/slider), [DateField](/components/date-field)
- Overlays: [Modal](/components/modal), [Drawer](/components/drawer), [Popover](/components/popover),
  [Tooltip](/components/tooltip), [Toaster](/components/toaster)
- Layout: [Stack](/components/stack), [Row](/components/row), [Grid](/components/grid), [Split](/components/split),
  [Shell](/components/shell)
- Data: [Table](/components/table), [DataGrid](/components/data-grid), [VirtualList](/components/virtual-list)

Larger patterns, like a sign-in flow, a settings page, a chat thread or a booking calendar, are under
[Blocks](/blocks). Charts, from a [line chart](/charts/line-chart) to a [Sankey diagram](/charts/sankey-chart), are under
[Charts](/charts). Agents get the same catalog from `weft plugins` and the AGENTS.md that `warp()` contributes.

## Styling a component's insides

Every warp component marks its root with `data-scope` and its pieces with `data-part`. These are the styling hooks:
stable names you can select in your own CSS. A `Card` is `data-scope="surface"`, with parts `eyebrow` and `title`;
a `Button` is `data-scope="button"`. Each component's page lists its scope, parts and states.

```css
/* src/app.css */
[data-scope="surface"] > [data-part="eyebrow"] { letter-spacing: 0.08em; }
[data-scope="button"][data-tone="critical"] { font-weight: 700; }
```

Because warp's rules sit in cascade layers with zero specificity, these plain selectors win without `!important`
([Styling](/learn/styling#cascade-layers) explains why). Prefer the tokens in what you write, like
`var(--warp-space-related)`, so your change follows the theme too.

:::deepdive Why data attributes and not class names
Class names are a component's private business: they change when the implementation does, and a library that promises
them can't refactor. `data-scope` and `data-part` are a published contract, the same names the specification uses, and
they double as state: `data-tone`, `data-emphasis`, `aria-expanded`, `aria-selected`. A selector like
`[data-scope="button"][aria-pressed="true"]` reads as what it means. Style groups use the same scheme for your own
components (`data-g` and `data-part`), so one kind of selector covers the whole page.
:::

## warp-core on its own

To keep your own markup and take only warp's behaviour, use `@weft-js/warp-core`. Each behaviour is an *action*: a
function that takes an element and options and returns `{ update, destroy }`. `menu`, `dialog`, `popover`, `tooltip`,
`roving`, `slider`, `listbox` and more are there. In weft, `use` from `@weft-js/warp-core/weft` attaches one to an
element after it mounts and destroys it with the component:

```tsx
import { roving } from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'

export function Toolbar() {
  let bar: HTMLDivElement | undefined
  // One tab stop for the whole toolbar; the arrow keys move between its buttons.
  use(roving, () => bar, () => ({ items: '[data-tool]' }))
  return (
    <div role="toolbar" aria-label="Text" ref={el => { bar = el }}>
      <span role="button" tabindex="0" data-tool>Bold</span>
      <span role="button" tabindex="-1" data-tool>Italic</span>
    </div>
  )
}
```

Nothing in `@weft-js/warp-core`'s main entry imports a framework, so the same actions work under React, Solid or plain
DOM. Start an app with `--ui headless` to get warp-core and its token CSS (`@weft-js/warp-core/styles/warp.css`) with no
components.

:::note
That toolbar uses `<span role="button">` to keep the example small. In a real app, use a real `<button>` element (in a
headless app, where D005 doesn't apply) so the browser gives you Enter, Space and the disabled state for free.
:::

## Recap

- `@weft-js/warp` is the components and their look; `@weft-js/warp-core` is the framework-free behaviour and CSS under them.
- Import components from `@weft-js/warp`; a page pays only for the ones it renders.
- `warp()` in `weft.config.ts` sets the seed accent, default dials, radius, fields, fonts and tokens, all checked for contrast.
- Name things by meaning: `tone`, `emphasis`, `size`. Overlays take their open state as a box.
- Style a component's insides through `data-scope` and `data-part`; your plain CSS wins over warp's layers.

## Try it

:::challenge A confirm before delete
This button deletes at once. Put a `Modal` in front of it: pressing Delete opens an alert dialog titled "Delete this
file?", with Cancel (which closes it) and a critical Delete that sets `deleted` and closes it.

```tsx
import { state } from '@weft-js/core'
import { Button, Text } from '@weft-js/warp'

export function File() {
  const deleted = state(false)
  return <>{deleted.value ? <Text subtle>Deleted.</Text> : <Button tone="critical" onClick={() => (deleted.value = true)}>Delete</Button>}</>
}
```
:::solution
```tsx
import { state } from '@weft-js/core'
import { Button, Modal, Text } from '@weft-js/warp'

export function File() {
  const deleted = state(false)
  const asking = state(false)
  const remove = () => {
    deleted.value = true
    asking.value = false
  }
  return (
    <>
      {deleted.value ? <Text subtle>Deleted.</Text> : <Button tone="critical" onClick={() => (asking.value = true)}>Delete</Button>}
      <Modal
        open={asking}
        alert
        title="Delete this file?"
        footer={
          <>
            <Button emphasis="ghost" tone="neutral" data-close="" autofocus>Cancel</Button>
            <Button tone="critical" onClick={remove}>Delete</Button>
          </>
        }
      />
    </>
  )
}
```

`open={asking}` passes the box, so Cancel (through `data-close`) and Escape can write `false` to it. `autofocus` on
Cancel means a stray Enter doesn't delete.
:::

:::challenge Give a menu its actions
Make a `Menu` labelled "Sort" with three items, Newest, Oldest and Name, that set an `order` box. Show the current order
under it, and make the trigger a quiet ghost button.
:::solution
```tsx
import { state } from '@weft-js/core'
import { Menu, Stack, Text } from '@weft-js/warp'

type Order = 'newest' | 'oldest' | 'name'

export function SortMenu() {
  const order = state<Order>('newest')
  return (
    <Stack gap="tight">
      <Menu
        label="Sort"
        trigger={{ emphasis: 'ghost', tone: 'neutral' }}
        items={[
          { label: 'Newest', onSelect: () => (order.value = 'newest') },
          { label: 'Oldest', onSelect: () => (order.value = 'oldest') },
          { label: 'Name', onSelect: () => (order.value = 'name') },
        ]}
      />
      <Text subtle>Sorted by {order.value}</Text>
    </Stack>
  )
}
```

`trigger` takes the same props as `Button`, so the trigger's weight is set by meaning like any other button.
:::

:::challenge Restyle a part
Every `Card` eyebrow in your app should be in the accent colour. Write the CSS, using a token so it follows the theme.
:::solution
```css
/* src/app.css */
[data-scope="surface"] > [data-part="eyebrow"] { color: var(--warp-color-accent-text); }
```

The rule has no layer, so it beats warp's layered rule for the eyebrow. `--warp-color-accent-text` is the accent's
text colour, which warp checks for contrast against surfaces in both themes; a raw colour would be D001 and would not
change in dark mode.
:::
