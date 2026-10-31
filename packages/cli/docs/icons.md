# Icons

`@weft/icons` is weft's own set: 160 original icons in warp's three expression tiers. Outline at quiet and balanced, pixel art drawn on a 16×16 grid at vivid. Rules: `docs/design/warp/10-icons.md`.

`weft add icons` installs it and adds `icons()` to the config. warp already depends on it.

## Using one

```tsx
import { IconCheck } from '@weft/icons'

<IconCheck />                 // decorative: aria-hidden, focusable="false"
<IconCheck label="Saved" />   // role="img" with that name
<IconCheck size={24} />       // otherwise warp's icon sizes apply
```

Every icon is its own export, named `Icon` plus the pascal-cased name, so `arrow-right` is `IconArrowRight`. An icon you don't import costs nothing. On average one adds about 170 B of brotli with all tiers in.

## By name

A name is a lookup, so the list has to be yours:

```tsx
import { iconSet, IconCheck, IconX } from '@weft/icons'

const Icon = iconSet({ yes: IconCheck, no: IconX })
<Icon name="yes" />
```

`import { Icon } from '@weft/icons/all'` is the same over every icon, for names that come from data. That one ships the whole set.

## Tiers

With no options each icon carries its tiers, and CSS shows the one for the nearest `data-expression`. Switching needs no script, doesn't flash and doesn't change the box. A nested `data-expression` is honoured.

To compile one tier in, with no switch, name it in the config:

```ts
import { icons } from '@weft/icons/plugin'

export default { plugins: [icons({ tier: 'vivid' })] }
```

`tier` is `quiet`, `balanced` or `vivid`. warp's own icons follow it too. After that a page's `data-expression` no longer changes icons: run `weft plugins sync` if you change it.

## Pixel sizes

The pixel tier is exact at 16, 32 and 48. At 20 and 24 a 1× screen rounds cells unevenly; a 2× screen draws 24 evenly. Prefer 16 or 32 at vivid.

## Styling

Icons are `currentColor`. The weft stroke, the one that says what the icon means, is `[data-w]`, so `svg [data-w] { stroke: var(--warp-color-accent-text) }` colours it. Its weight is `--warp-icon-weft`.

## Names

`weft icons` isn't a command; the names are in `@weft/icons/all`, as `names`, and on the contact sheet from `npm run sheet` in the package.
