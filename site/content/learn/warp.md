# Using warp

:::learn
- What warp and warp-core are
- How to build a form from warp's components
- How the look follows the theme and the dials
:::

warp is weft's UI toolkit: forms, overlays, tables, charts and more, with keyboard and screen reader support built in.
Its behaviour lives in warp-core, which is plain TypeScript with no framework, and warp adds the components and their look.

:::demo ui-kit

## Components

Import what you use from `@weft-js/warp`. You pay only for those: a page with a button doesn't load the rest.

```tsx
import { Button, Card, Input, Stack } from '@weft-js/warp'

<Card title="Billing">
  <Stack gap="related">
    <Input label="Billing email" type="email" />
    <Button>Save</Button>
  </Stack>
</Card>
```

Every component is on the [Components](/components) pages, with its props, live examples and keyboard table. Larger
patterns are under [Blocks](/blocks), and charts under [Charts](/charts).

## Name what it is

Pick a component by what the thing is, and set props like `tone` and `emphasis` by what they mean:
`<Button tone="critical" emphasis="outline">`. The look comes from tokens, so it follows the theme, the density and the
expression dial (quiet, balanced or vivid) without changes to your code. In an app with warp, `weft check` reports
off-system values such as a raw colour as D-codes.

## warp-core on its own

To keep your own markup and take only warp's behaviour, such as menus, dialogs and roving focus, use
`@weft-js/warp-core`. It also works with React, Solid or no framework. Start an app with `--ui headless` for this.

## Recap

- `@weft-js/warp` is the components and look. `@weft-js/warp-core` is the behaviour under them.
- Name components and props by meaning; the theme does the rest.
- The toolkit pages list every component with live examples.
