# Icons

:::learn
- How to use an icon from `@kerf-js/veneer-icons`, three ways that build to the same bytes
- When an icon needs a `label`, and when it should stay hidden
- What hollow, solid and the three tiers are
- What the `icons()` plugin does, and what I001, I002 and I003 tell you
- How the five action icons animate
:::

Kerf has its own icon set, `@kerf-js/veneer-icons`: 651 icons drawn for Veneer, each in a hollow and a solid form, and each
drawn again for Veneer's three expressions. Veneer depends on it, so an app with Veneer already has it. You can browse every
one on the [icon browser](/icons).

The set is built to cost nothing you don't use. An icon is a small component; an unused one tree-shakes away, and one
you use adds about 164 bytes of brotli with all three tiers in.

:::demo style-icons

## Three ways to use one

```tsx
import { CheckIcon } from '@kerf-js/veneer-icons'
import Icons from '@kerf-js/veneer-icons'
import { Icon } from '@kerf-js/veneer'

export function Saved() {
  return (
    <p>
      <CheckIcon /> <Icons.Check /> <Icon name="check" />
    </p>
  )
}
```

All three draw the same check, and the build compiles all three to the same thing. Use whichever reads best:

- **A named import**, `CheckIcon`, when you know the icon. This is the usual form.
- **The pack**, `Icons.Check`, when a file uses many and a long import line gets in the way.
- **`<Icon name>`**, when the name is data, like a menu item's `icon: 'pencil'`. `Icon` is exported from both
  `@kerf-js/veneer` and `@kerf-js/veneer-icons/icon`.

Veneer's own components take icons the same way. `Button`, `Toggle`, menu items and `Segmented` options have an `icon` prop
that takes a name or the component:

```tsx
import { TrashIcon } from '@kerf-js/veneer-icons'
import { Button, Menu } from '@kerf-js/veneer'

export function Actions() {
  return (
    <>
      <Button icon="pencil">Edit</Button>
      <Button
        icon={TrashIcon}
        tone="critical"
        emphasis="soft"
      >
        Delete
      </Button>
      <Menu
        label="More"
        items={[
          { label: 'Copy link', icon: 'link' },
          { label: 'Archive', icon: 'archive' },
        ]}
      />
    </>
  )
}
```

## Names and variants

Names are kebab-case in `<Icon name>` and PascalCase in exports. Each icon has these forms:

| Export | Pack | `<Icon>` | What it is |
|---|---|---|---|
| `BellIcon` | `Icons.Bell` | `name="bell"` | hollow, the default |
| `BellIconHollow` | `Icons.BellHollow` | | the same, by its full name |
| `BellIconSolid` | `Icons.BellSolid` | `name="bell" solid` | the solid form |
| `BellIconAction` | `Icons.BellAction` | `name="bell" action` | animated (five icons have one) |

Solid is a second drawing, not the outline filled in. Use it for the "on" state of something, like a favourite that's
set, or a selected tab's icon. An open mark like an arrow is drawn as an object: hollow outlines
the arrow's shape, and solid fills it.

## Decorative or named

An icon is **decorative** by default: it renders with `aria-hidden="true"` and `focusable="false"`, so a screen reader
skips it. That is right when text beside it already says the same thing, as in `<CheckIcon /> Saved`. Reading "check
mark, Saved" would only add noise.

When the icon is the only thing that carries the meaning, give it a `label`. It becomes `role="img"` with that name:

```tsx
import { AlertIcon } from '@kerf-js/veneer-icons'

export function Warning() {
  return <AlertIcon label="Warning" />
}
```

For an icon-only *button*, put the label on the button, not the icon. Veneer's `Button` and `Toggle` take `label` for
exactly this, and it becomes the button's accessible name:

```tsx
import { Button } from '@kerf-js/veneer'

export function Close(props: { onClose: () => void }) {
  return <Button
    emphasis="ghost"
    tone="neutral"
    icon="x"
    label="Close"
    onClick={props.onClose}
  />
}
```

:::pitfall An icon-only button with no name
`<Button icon="x" />` with no `label` is announced as "button" and nothing else, so a screen reader user can't tell what
it does. `kerf check` reports a button or link with no accessible name as D031. Give it a `label`, and keep the label
the same when a toggle changes state: "Like", with `aria-pressed` saying whether it's on, not "Like" and "Unlike".
:::

### Size

Icons take Veneer's icon sizes from their context, so an icon in a small button is small. `size` sets one by hand, in
pixels or any CSS length: `<StarIcon size={24} />`, `<StarIcon size="1.5em" />`.

## Tiers follow the expression

Each icon is drawn three times, once for each expression: outline at `quiet` and `balanced` (finer at `quiet`), and
pixel art on a 16×16 grid at `vivid`. With no options, every icon carries all three and CSS shows the one for the nearest
`data-expression`. Switching needs no script, doesn't flash and doesn't change the icon's box, and a nested
`data-expression` is honoured, as for every other dial. [Theming](/learn/theming) has the dials.

To show one tier whatever the page's expression, pass `tier`:

```tsx
import { HeartIcon } from '@kerf-js/veneer-icons'

export function Pixel() {
  return <HeartIcon tier="vivid" size={32} />
}
```

:::note Pixel sizes
The pixel tier is exact at 16, 32 and 48 pixels. At 20 or 24 a 1× screen rounds its cells unevenly. At `vivid`, prefer
16 or 32.
:::

## The `icons()` plugin

`kerf add icons` installs the package, if it isn't there, and adds `icons()` to `kerf.config.ts`. With no options the
plugin changes no output; it tells agents how the names work and lets you set two things:

<!-- example: skip @kerf-js/veneer-icons/plugin has no type declarations yet (TS7016 under strict) -->
```ts
import { defineConfig } from '@kerf-js/core/config'
import { veneer } from '@kerf-js/veneer/plugin'
import { icons } from '@kerf-js/veneer-icons/plugin'

export default defineConfig({
  plugins: [veneer(), icons({ tier: 'balanced' })],
})
```

- **`tier`** (`quiet`, `balanced` or `vivid`) compiles one tier in and drops the others, Veneer's own icons included. The
  icons stop following `data-expression` after that. Run `kerf plugins sync` if you change it.
- **`source`** loads icons one at a time from a URL instead of building them in. It's for names that are only known at
  runtime, below.

## A wrong name

`<Icon name>` is typed, so a misspelt name is a type error in your editor. Untyped code gets the same from the compiler
and from `kerf check`, and it fails the build:

```
I001 no icon 'chekc', did you mean 'check'?
```

A variant an icon doesn't have is I001 too, such as `action` on an icon that has no animation.

## Names known only at runtime

The build follows a name through variables, props, conditionals and maps, and ships the icons it finds. This is
followed all the way, so it ships only `circle`, `truck` and `check`:

```tsx
import { Icon, type IconName } from '@kerf-js/veneer'

type Status = 'open' | 'shipped' | 'delivered'

const ICON: Record<Status, IconName> = {
  open: 'circle', shipped: 'truck', delivered: 'check',
}

export function StatusIcon(props: { status: Status }) {
  return <Icon name={ICON[props.status]} label={props.status} />
}
```

A name the build can't follow, such as one that comes from your database, is still legal. `kerf check` reports it as
I002 with the file and what it costs, and that use gets one of two things:

- **The pack, as its own chunk** (the default). All 651 icons, about 111 KB of brotli, loaded only by a page that reaches
  that use. Other pages don't pay for it.
- **Single icons from a URL**, with `icons({ source: 'https://cdn.example.com/icons/' })`. Nothing of the pack is built;
  each icon is fetched the first time it's drawn. `kerf icons publish <dir>` writes every icon and variant as `.svg`
  files with a `manifest.json`, for you to host at that URL.

A remote icon renders an empty `<svg>` of the right size until it arrives, so nothing shifts, and it stays empty on the
server, so server rendering needs no network.

I003 is the same thing for the pack itself: passing `Icons` around as a value (into a function, say) means the build
can't tell which icons you use, so all of them ship with the page.

:::pitfall Map the data to names you know
Before you accept I002, ask whether the data really has open-ended names. Usually it has a handful of kinds, like a
status or a category. Map those kinds to icon names in your code, as `ICON` does above. Then the build can see every
name, the pack never loads, and a typo is a type error instead of an empty square in production.
:::

## Action icons

Five icons have a built-in animation: `trash` (the lid lifts), `bell` (it rings), `check` (it draws on), `refresh` (it
spins) and `copy` (the sheet stacks).

```tsx
import { RefreshIconAction } from '@kerf-js/veneer-icons'
import { Button, Icon } from '@kerf-js/veneer'

export function Actions(props: { syncing: boolean }) {
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
      >
        <Icon name="trash" action /> Empty bin
      </Button>
      <RefreshIconAction
        action={props.syncing ? 'on' : 'hover'}
        label="Sync"
      />
    </>
  )
}
```

`action` (or `action="hover"`) plays on hover, focus or press of the icon or its parent, so an icon inside a button plays
when the button is hovered. `'focus'` and `'press'` narrow it to one of those, and `'on'` plays now; `refresh` keeps
spinning while it's on. The animation is CSS only, and each one's stylesheet ships only if that icon is used. The motion
dial and the system's reduced-motion setting turn it off.

## Colour

Icons draw in `currentColor`, so an icon takes the colour of the text around it, and a `tone` on a button colours its
icon too. Two hooks go further:

```css
/* The meaning-bearing stroke (the "kerf") in the accent colour. */
.feature svg[data-icon] {
  --veneer-icon-kerf-color: var(--veneer-color-accent-text);
}

/* Cut a solid icon's marks out in the surface colour. */
.badge-solid svg[data-icon] {
  --veneer-icon-knock: var(--veneer-color-accent-solid);
}
```

A solid icon's cut-out marks are drawn in `--veneer-icon-knock`, which defaults to `Canvas`, the browser's page background colour. On a
solid button, set it to the button's fill so the marks read as holes.

## Recap

- Use `CheckIcon`, `Icons.Check` or `<Icon name="check">`; all three build to the same bytes, and unused icons cost
  nothing.
- Icons are decorative by default. Give one a `label` when it alone carries meaning, and give an icon-only button a `label`.
- Each icon has hollow (default) and solid forms, drawn for three tiers that follow `data-expression`.
- A wrong name is I001. A name the build can't follow is I002; map data to known names, or serve icons from a URL with
  `icons({ source })`.
- `trash`, `bell`, `check`, `refresh` and `copy` animate with `action`, and respect reduced motion.

## Try it

:::challenge Name the icon buttons
This toolbar works with a mouse, but a screen reader announces three unnamed buttons. Fix it.

<!-- example: skip the challenge's starting code, which has the D031 mistakes on purpose -->
```tsx
import { Button, Row } from '@kerf-js/veneer'

export function Formatting() {
  return (
    <Row gap="tight">
      <Button
        emphasis="ghost"
        tone="neutral"
        icon="bold"
      />
      <Button
        emphasis="ghost"
        tone="neutral"
        icon="italic"
      />
      <Button
        emphasis="ghost"
        tone="neutral"
        icon="link"
      />
    </Row>
  )
}
```
:::solution
```tsx
import { Button, Row } from '@kerf-js/veneer'

export function Formatting() {
  return (
    <Row
      gap="tight"
      role="toolbar"
      aria-label="Formatting"
    >
      <Button
        emphasis="ghost"
        tone="neutral"
        icon="bold"
        label="Bold"
      />
      <Button
        emphasis="ghost"
        tone="neutral"
        icon="italic"
        label="Italic"
      />
      <Button
        emphasis="ghost"
        tone="neutral"
        icon="link"
        label="Add link"
      />
    </Row>
  )
}
```

`label` becomes each button's accessible name, which also clears D031. Naming the group as a toolbar tells a screen
reader user what the three belong to.
:::

:::challenge Solid when it's on
Make a `Favourite` toggle that shows the hollow star when off and the solid star when on, with a constant name.
:::solution
```tsx
import { state } from '@kerf-js/core'
import { StarIcon, StarIconSolid } from '@kerf-js/veneer-icons'
import { Toggle } from '@kerf-js/veneer'

export function Favourite() {
  const on = state(false)
  return <Toggle
    pressed={on.value}
    icon={on.value ? StarIconSolid : StarIcon}
    label="Favourite"
    onClick={() => (on.value = !on.value)}
  />
}
```

`Toggle` sets `aria-pressed`, so the state is announced, and the name "Favourite" stays the same either way. The solid
form is the visual "on", matching what a screen reader hears.
:::

:::challenge Keep the pack out of the page
A notification's kind comes from the server as a string, and the component below makes `kerf check` report I002 (and a
type error, since a `string` isn't an `IconName`). The kinds are `order`, `payment` and `message`. Rewrite it so the
build knows every icon.

<!-- example: skip the challenge's starting code, which has the type error on purpose -->
```tsx
import { Icon } from '@kerf-js/veneer'

export function Notice(props: { kind: string; text: string }) {
  return <p><Icon name={props.kind} /> {props.text}</p>
}
```
:::solution
```tsx
import { Icon, type IconName } from '@kerf-js/veneer'

type Kind = 'order' | 'payment' | 'message'

const ICON: Record<Kind, IconName> = {
  order: 'package', payment: 'wallet', message: 'mail',
}

export function Notice(props: { kind: Kind; text: string }) {
  return <p><Icon name={ICON[props.kind]} /> {props.text}</p>
}
```

The map turns open data into three names the build can see, so only those three icons ship. Narrowing `kind` to a union
also moves the check to where the data enters your app, which is where a bad value should be caught.
:::
