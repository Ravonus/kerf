# Theme: changing warp's look

Three levels, in order. Stop at the first that gets you there; each one keeps the contrast check.

1. `warp({ seed, dials, radius, fonts, tokens })` in the weft config. Checked by D010 at the stops `dials` leave.
2. `src/theme.css`, unlayered: `[data-scope]` and `[data-part]` rules beat warp with no `!important`.
3. Your own component, with warp's tokens.

## warp() options

| Option | Does |
|---|---|
| `seed.accent` | The hue family, `#rrggbb`. Each theme solves its own lightness, and `weft build` prints where it landed |
| `seed.neutral` | The tint of pages, surfaces and text, `#rrggbb` or `{ hue, chroma }` |
| `dials` | Default `expression` (quiet balanced vivid), `density`, `flair`, `theme`. With `theme: 'light'`, dark isn't checked |
| `radius` | `sharp` (2px), `soft`, `round`. Below 2px, set the radius tokens |
| `fonts` | `body`, `display`, `mono`: a family or a whole stack |
| `tokens` | Any `--warp-*`, set on every scope. Colours are `#rrggbb`, `oklch()`, `color-mix()` or `light-dark()` |

App-wide values go in `warp()`. A `--warp-color-*` set in CSS on `:root` skips the check and is undone inside any scope that
sets a dial, such as a Table's density.

## Named colours and palettes

`colors` names hex colours and aliases. Use `var(--warp-named-brand)`
in CSS. Named themes replace existing colour names; they do not add names.

```ts
import { warp } from '@weft-js/warp/plugin'

warp({
  colors: { brand: '#333333', ink: 'brand' },
  themes: { studio: { colors: { brand: '#555555' } } },
  dials: { palette: 'studio' },
})
```

Set `data-palette="studio"` on a subtree, or call
`setDial('palette', 'studio')` to change the document synchronously.
`auto` removes the attribute and follows the configured default;
`default` selects the base colours. `persist: true` and `url: true`
work on the document root only. Add `dialScript` to `site.head` to
restore a persisted choice before paint.

Named palettes support colour replacements only. They cannot be combined
with nonempty `seed`, `tokens`, or `parts`; system overrides are not yet
supported. For a root Button override without named palettes, supply both
resting colours:

```ts
import { warp } from '@weft-js/warp/plugin'

warp({
  colors: { charcoal: '#333333', paper: '#ffffff' },
  parts: { button: { bg: 'charcoal', text: 'paper' } },
})
```

The build checks the pair. State and other part settings are not supported
by this config. Local CSS can still override existing raw custom properties,
as in the Button channels below. The generated [token reference](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/theme-tokens.md)
lists candidate coverage; unresolved and partial rows are not a promise of
supported configuration.

## Brutalist

```ts
warp({
  dials: { expression: 'quiet', flair: 'none' },
  fonts: {
    display: 'ui-monospace, monospace',
    body: 'ui-monospace, monospace',
  },
  tokens: {
    '--warp-radius-mark': '0px',
    '--warp-radius-control': '0px',
    '--warp-radius-surface': '0px',
  },
})
```

```css
/* src/theme.css */
[data-scope="button"] {
  --warp-tone-edge: var(--warp-color-text);
  border-width: 2px;
  box-shadow: 4px 4px 0 var(--warp-color-text);
}
[data-scope="surface"] {
  border: 2px solid var(--warp-color-text);
  box-shadow: none;
}
```

Raw colours and shadows in `src/theme.css` or on a `[data-scope]` rule are D001 and D003 warnings, not errors.

## Warm editorial

```ts
warp({
  seed: { accent: '#9a3412', neutral: { hue: 70, chroma: 0.03 } },
  dials: { expression: 'vivid' },
  fonts: { display: '"Iowan Old Style", Georgia, serif' },
})
```

## An exact brand

A seed gives the hue, not the colour. To pin it, set the fill and its hover for both themes. One alone never re-derives the other.

```ts
warp({
  seed: { accent: '#c8102e' },
  tokens: {
    '--warp-color-accent-solid': 'light-dark(#c8102e, #e5484d)',
    '--warp-color-accent-solid-hover': 'light-dark(#a50d26, #f2666a)',
  },
})
```

## Button tone channels

A rule that sets a button's `background` leaves its hover layer on the accent. Set the channels and fill, ink, edge and hover
stay together, at every emphasis:

| Channel | Paints |
|---|---|
| `--warp-tone-fill` | The background |
| `--warp-tone-ink` | The text |
| `--warp-tone-edge` | The border |
| `--warp-tone-layer` | The hover layer that wipes across |

```css
[data-scope="button"][data-emphasis="solid"] {
  --warp-tone-fill: #111111;
  --warp-tone-ink: #ffffff;
  --warp-tone-layer: #333333;
}
```

The channels are on Button only. Fields read `--warp-field-*`, tables `--warp-table-*`.

## D010

Each failing pair is named with its stop. Change that token or the seed, or limit the stops with `dials`. `weft build` stops on
it, because a refused config would ship warp's default look.
