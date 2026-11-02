# Icons

`@weft-js/warp-icons` is weft's own set: 651 original icons in warp's three expression tiers. Outline at quiet and balanced, pixel art on a 16×16 grid at vivid. Each has two forms, hollow (the default) and solid, drawn apart in every tier and shaded with dither.

`weft add icons` installs it and adds `icons()` to the config. warp already depends on it.

## Using one

Three forms, and all three build to the same bytes:

```tsx
import { CheckIcon } from '@weft-js/warp-icons'
<CheckIcon />

import Icons from '@weft-js/warp-icons'           // or: import * as Icons
<Icons.Check />

import { Icon } from '@weft-js/warp'         // or: '@weft-js/warp-icons/icon'
<Icon name="check" />
```

Props on any of them:

```tsx
<CheckIcon />                 // decorative: aria-hidden, focusable="false"
<CheckIcon label="Saved" />   // role="img" with that name
<CheckIcon size={24} />       // otherwise warp's icon sizes apply
<CheckIcon tier="vivid" />    // this tier whatever the page's expression is
```

An icon you don't use costs nothing. One adds about 164 B of brotli with all tiers in. `sideEffects` lists only CSS, so a named import ships that icon.

## Names and variants

One scheme, generated from the art with its types:

| Export | Pack | `<Icon>` | What it is |
|---|---|---|---|
| `BellIcon` | `Icons.Bell` | `name="bell"` | hollow, the default |
| `BellIconHollow` | `Icons.BellHollow` | | the same, by name |
| `BellIconSolid` | `Icons.BellSolid` | `solid` | the solid form |
| `BellIconAction` | `Icons.BellAction` | `action` | has a built-in animation |

The tier is a prop, never a name. An open mark, like an arrow, has a notched badge as its solid, with the mark cut out. Pick it on the sheet: `npm run sheet` in the package writes `contact-sheet.html`, with tier, variant, size, theme and search. `dither-sheet.html` compares the treatments.

## A wrong name

`<Icon name>` is typed, so a bad name is a type error. Untyped code gets the same from the compiler and from `weft check`:

```
I001 no icon 'chekc', did you mean 'check'?
```

It fails the build, and so does a variant an icon doesn't have.

## Names that aren't literal

The build follows a name through variables, props, conditionals, maps and component boundaries, and ships what it finds. A name it can't follow, such as one from an API, is legal. `weft check` reports it as I002 with the file and the cost (I003 if the pack itself is passed around). That use then gets one of two things:

- **The pack, as its own chunk.** The default. About 111 KB of brotli for all 651 with every tier in, loaded only by a page that reaches it. A page stays about 1.6 KB bigger than one with no dynamic name.
- **Single icons from a URL.** `icons({ source: 'https://cdn.example.com/icons/' })`. Nothing of the pack is built; each icon is fetched when first drawn.

`weft icons publish <dir>` writes every icon and variant as static `.svg` files, with a `manifest.json`, for that URL. It writes files and uploads nothing. Action icons aren't published.

A remote icon renders an empty `<svg data-icon data-loading>` of the right size until it arrives, then swaps with no layout shift, and carries `data-failed` if the fetch fails. It stays empty on the server, so SSR needs no network. Elements are allowlisted before they are inserted. A Content-Security-Policy needs that origin in `connect-src`.

## Actions

Five icons have a built-in animation: `trash` (the lid lifts), `bell` (it rings), `check` (it draws on), `refresh` (it spins), `copy` (the sheet stacks).

```tsx
<Icon name="trash" action />          // hover, focus and press, on the icon or its parent
<Icon name="refresh" action="on" />   // now; refresh keeps spinning
<TrashIconAction action="press" />    // 'hover' | 'focus' | 'press' | 'on'
```

It's CSS alone, and each one's stylesheet ships only if that icon is used (about 230 B of CSS and 50 B of JS, brotli). Outlines ease; pixels move in whole cells, in frames. warp's motion dial and `prefers-reduced-motion` turn it off. An action on another icon is I001.

## Tiers

With no options each icon carries its tiers, and CSS shows the one for the nearest `data-expression`. Switching needs no script, doesn't flash and doesn't change the box. A nested `data-expression` is honoured. The build keeps only the tiers your config and `data-expression` attributes name.

To compile one tier in, with no switch, name it in the config:

<!-- example: skip @weft-js/warp-icons/plugin has no type declarations yet (TS7016 under strict) -->
```ts
import { icons } from '@weft-js/warp-icons/plugin'

export default { plugins: [icons({ tier: 'vivid' })] }
```

`tier` is `quiet`, `balanced` or `vivid`. warp's own icons follow it too. After that a page's `data-expression` no longer changes icons: run `weft plugins sync` if you change it.

## Pixel sizes

The pixel tier is exact at 16, 32 and 48. At 20 and 24 a 1× screen rounds cells unevenly; a 2× screen draws 24 evenly. Prefer 16 or 32 at vivid.

## Styling

A solid cuts its marks with `--warp-icon-knock`, which defaults to `Canvas`. On a coloured surface, like a solid button, set it to that surface's colour.

Icons are `currentColor`. The weft stroke, the one that says what the icon means, is `[data-w]`, so `svg [data-w] { stroke: var(--warp-color-accent-text) }` colours it. Its weight is `--warp-icon-weft`.
