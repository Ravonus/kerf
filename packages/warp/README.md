# @weft-js/warp

> **Early release (0.1.x).** APIs can change between minor versions.

Warp is Weft's UI toolkit: more than a hundred components with keyboard support, screen-reader names and checked
contrast built in, and one config that re-themes all of them. The components and their look are here. Their behaviour
is in [`@weft-js/warp-core`](../warp-core), which works without any framework.

An app made with `npm create @weft-js` gets Warp by default (`--ui warp`). To add it to another Weft app:

```bash
npx weft add warp
```

or install it and add the plugin yourself:

```bash
npm install @weft-js/warp
```

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({ plugins: [warp()] })
```

## Use it

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

Every field takes a `label`, and leaving it out is a type error, so no input ships without a name.

Warp's components run no code as they load, so an island holding them can wait for the screen or a tap. Scroll motion
(`data-flow`) belongs to the page, so the app arms it once, in `src/entry.client.ts`:

```ts
import { start } from '@weft-js/start/client'
import { flow } from '@weft-js/warp-core'
import * as routes from 'virtual:weft/routes'

flow()
start(routes)
```

Without it the page stays still, with every word in place.

## What's in it

| Kind | Components |
|---|---|
| Actions | `Button`, `Chip`, `Toggle`, `Menu`, `CommandPalette`, `Kbd` |
| Fields | `Input`, `Textarea`, `Search`, `Select`, `NumberField`, `DateField`, `TimeField`, `DurationField`, `MonthPicker`, `RecurrenceField`, `CountrySelect`, `TimeZoneSelect`, `CurrencySelect`, `PhoneField`, `AddressField`, `CodeInput`, `MentionsInput`, `RichTextEditor`, `SignaturePad`, `KeyValueEditor`, `PaymentCardInput` |
| Choices | `Checkbox`, `Radio`, `Switch`, `Segmented`, `Slider` |
| Overlays | `Modal`, `Drawer`, `Popover`, `Tooltip`, `Toaster` with `toast.show()` and `toast.promise()` |
| Layout and navigation | `Shell`, `SideNav`, `Nav`, `Tabs`, `Accordion`, `PaginationBar`, `HamburgerMenu`, `ScrollRail` |
| Data | `Table`, `DataGrid` (sorting, filtering, grouping, pivots), `VirtualList`, `ScrollGrid`, `Feed`, `InlineCalendar`, `Chart` |
| Feedback | `Alert`, `Badge`, `Tag`, `Progress`, `Spinner`, `Skeleton`, `Presence`, `Ticker` |
| Content | `Markdown`, `CodeBlock`, `Icon`, `Canvas`, `Dither` |

The docs site has a page for each one, with its props, live examples and keyboard table. `weft docs design` has the
design language, and the D-codes `weft check` reports in an app with Warp.

## Theme it

The look comes from tokens, so every component follows the theme, the density and the expression dial (quiet, balanced
or vivid) with no change to your code. One config sets the app's look, and every value in it is contrast-checked at
build time:

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

`setDial()` and `setPalette()` switch at run time. Below the config, `[data-scope]` and `[data-part]` selectors restyle
any part with no `!important`. `weft docs theme` has every option, part and state.

**The Theme studio** on the docs site (Components → Theming → Theme studio) builds this config for you. It has sliders,
colour pickers, presets and per-part editing, shows real components taking the theme live with their contrast ratios,
and copies the result as `weft.config.ts`.

## Entries

| Import | What it has |
|---|---|
| `@weft-js/warp` | The components, `toast`, `setDial`, `getDial`, `setPalette`, `getPalette` |
| `@weft-js/warp/plugin` | `warp()` for `weft.config.ts` |
| `@weft-js/warp/theme` | The theme compiler without Node: what the plugin and the Theme studio both run |
| `@weft-js/warp/skeleton` | The skeleton CSS, for a page that uses `<Boundary pending="shape">` without a `<Skeleton>` |
| `@weft-js/warp/tailwind.css` | Warp's tokens as Tailwind v4 theme values: `bg-surface`, `text-accent`, `rounded-control` |

## Size

An app built with Warp has a ceiling of 50 KB of brotli JavaScript and CSS. `evals/gates/warp-exit.mjs` builds the
shop app from the evals with Warp and checks it against that. `pnpm run size` in this folder prints what each component
costs on its own and on a page with the others.
