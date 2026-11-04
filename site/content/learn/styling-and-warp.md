# Styling and warp

:::learn
- How to style elements with `class`, `style`, plain CSS and style groups
- How to build UI from warp's components
- How to theme an app with warp's dials and tokens
- How to use icons and fonts without paying for what you don't use
- What warp does for accessibility, and what you still own
:::

So far you've built components that hold state and respond to events. This chapter is about how they look, and about
warp, weft's UI toolkit. weft gives styling a small core (attributes that follow state) and a design language on top:
tokens for colour, space and type, components that use them, and diagnostics that say when a value leaves them. You can
use as much or as little of it as you like.

## Styling and style groups

`class` and `style` are attributes that read state like any other. For your own components, a style group names a
thing, its variations and its pieces, in tokens, and compiles each use to plain `data-*` attributes:

:::demo style-order

```tsx
import { derived } from '@weft-js/core'
import { group } from '@weft-js/core/style'

const badge = group('stock-badge', {
  base: {
    layout: 'inline',
    padInline: 'related',
    radius: 'round',
    text: 'caption',
    emphasis: 'soft',
  },
  axes: {
    level: {
      plenty: { tone: 'positive' },
      low: { tone: 'caution' },
      none: { tone: 'critical' },
    },
  },
  defaults: { level: 'plenty' },
})

export function Stock(props: { count: number }) {
  const { count } = props
  const level = derived(() =>
    count === 0 ? 'none' : count < 5 ? 'low' : 'plenty'
  )
  return (
    <span {...badge({ level: level.value })}>
      {count} left
    </span>
  )
}
```

Read **[Styling and style groups](/learn/styling)** to learn how `class` and `style` work, where plain CSS fits, how
style groups are built, and what the D-codes in `weft check` catch.

## Using warp

warp is a toolkit of components (forms, dialogs, menus, tables, charts and larger blocks) with keyboard and screen reader
support built in. Import what you use, and name things by meaning rather than look:

:::demo ui-kit

```tsx
import { Button, Card, Input, Stack } from '@weft-js/warp'

export function Billing() {
  return (
    <Card title="Billing">
      <Stack gap="related">
        <Input label="Billing email" type="email" />
        <Button>Save</Button>
      </Stack>
    </Card>
  )
}
```

Read **[Using warp](/learn/warp)** to learn how to compose forms, dialogs, menus and tables, set up the `warp()` plugin,
and style a component's insides.

## Theming

The look is a set of `--warp-*` tokens, and six dials (theme, expression, density, motion, fields and flair) change their
values. Each dial is a `data-*` attribute, on the page or on any element:

:::demo style-dials

```tsx
import { Card, Text } from '@weft-js/warp'

export function Sidebar() {
  return (
    <aside data-theme="dark" data-density="compact">
      <Card title="Today">
        <Text subtle>
          Dark and compact, whatever the page around it is.
        </Text>
      </Card>
    </aside>
  )
}
```

Read **[Theming](/learn/theming)** to learn how dark mode works, how to add a theme switch that remembers, and how to set
your brand colour and tokens safely.

## Icons

`@weft-js/warp-icons` has 651 icons, each hollow and solid, drawn for warp's three expressions. One you use costs about
164 bytes; one you don't costs nothing:

:::demo style-icons

```tsx
import { CheckIcon } from '@weft-js/warp-icons'
import { Button } from '@weft-js/warp'

export function Done() {
  return (
    <>
      <p>
        <CheckIcon /> Saved
      </p>
      <Button
        emphasis="ghost"
        tone="neutral"
        icon="x"
        label="Close"
      />
    </>
  )
}
```

Read **[Icons](/learn/icons)** to learn the three ways to use an icon, when one needs a label, and what happens when a
name is only known at runtime.

## Fonts

The `text()` plugin from `@weft-js/text` is the one place an app declares its fonts. The build subsets them, preloads the
ones the first paint needs, and writes a fallback matched to each font's metrics, so the page doesn't jump when the
font arrives:

```ts
import { defineConfig } from '@weft-js/core/config'
import { text } from '@weft-js/text'

export default defineConfig({
  plugins: [
    text({
      fonts: {
        body: {
          family: 'Inter',
          src: 'assets/fonts/inter.woff2',
          fallback: 'Arial',
          axes: { wght: [100, 900] },
        },
      },
    }),
  ],
})
```

Read **[Fonts](/learn/fonts)** to learn what the build does with each face, how to use one in CSS and in warp, and how
variable fonts are trimmed.

## Accessibility

warp's components are native elements with names, keyboard patterns and focus management built in. You own the
structure and the words, and `weft check` catches the common mistakes in markup you write yourself:

:::demo style-keyboard

```tsx
import { state } from '@weft-js/core'
import { Button, Text } from '@weft-js/warp'

export function Details() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="link"
        aria-expanded={open.value}
        onClick={() => (open.value = !open.value)}
      >
        Shipping
      </Button>
      {open.value && (
        <Text>Roasted on Monday, shipped on Tuesday.</Text>
      )}
    </>
  )
}
```

Read **[Accessibility](/learn/accessibility)** to learn what warp handles, what you still own, which diagnostics catch
accessibility mistakes, and how to test for them.

## What's next

Head to [Styling and style groups](/learn/styling) to start the chapter page by page.
