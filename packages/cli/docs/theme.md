# Theme: changing warp's look

Three levels, in order. Stop at the first that gets you there; each one keeps the contrast check.

1. `warp({ seed, dials, fields, radius, fonts, tokens })` in the weft config. Checked by D010 at the stops `dials` leave.
   For your own names, per-element looks and named themes: `colors`, `system`, `parts`, `themes` (below).
2. `src/theme.css`, unlayered: `[data-scope]` and `[data-part]` rules beat warp with no `!important`.
3. Your own component, with warp's tokens.

The Theme studio on the docs site (`/components/theme-studio`) edits level 1 with live components and contrast
ratios, and copies the result as `weft.config.ts`.

## warp() options

| Option | Does |
|---|---|
| `seed.accent` | The hue family: `#rrggbb`, a name from `colors`, or `{ hue, chroma }`. Each theme solves its own lightness, and `weft build` prints where it landed |
| `seed.neutral` | The tint of pages, surfaces and text, `#rrggbb` or `{ hue, chroma }` |
| `dials` | Default `expression` (quiet balanced vivid), `density`, `flair`, `theme`. With `theme: 'light'`, dark isn't checked |
| `fields` | `floating` (the default: the label floats in a notch) or `classic` (the label above the box) |
| `radius` | `sharp` (2px), `soft`, `round`. Below 2px, set the radius tokens |
| `fonts` | `body`, `display`, `mono`: a family or a whole stack |
| `tokens` | Any `--warp-*`, set on every scope. Colours are `#rrggbb`, `oklch()`, `color-mix()` or `light-dark()` |

App-wide values go in `warp()`. A `--warp-color-*` set in CSS on `:root` skips the check and is undone inside any scope that
sets a dial, such as a Table's density.

## colors, system, parts, themes

| Option | Does |
|---|---|
| `colors` | `{ brand: '#e8590c' }`: `--warp-color-brand`, a tone (`tone="brand"`), and `bg-brand` via `.weft/tokens/warp.tailwind.css`. Lowercase names, `#rrggbb` |
| `system` | The scales: `radius`, `space`, `pad`, `control`, `font`, `shadow`, `duration`, `ease`, `border`, `icon`, `text.<role>` |
| `parts` | One element, at rest and per state (`hover focus press active open disabled`). Numbers are px (ms for `duration`); names are system steps or `colors` |
| `themes` | `{ ocean: { seed, colors, system, parts } }` under `[data-palette="ocean"]`. `dials.palette` sets the default; `setPalette()` switches |

Every part takes `bg text border borderWidth radius padding paddingX paddingY gap margin height minHeight width size
shadow opacity scale duration easing font fontSize weight leading tracking case`. A part's own keys add to those or
replace one of the same name with its own meaning (an underline's `width` is its thickness):

| Part | For | Own keys | States |
|---|---|---|---|
| `button` | Button and ButtonLink | `bg` `text` `border` `radius` | hover focus press active open disabled |
| `button.soft` |  | `bg` `text` `border` | hover focus press active open disabled |
| `button.outline` |  | `bg` `text` `border` | hover focus press active open disabled |
| `button.ghost` |  | `bg` `text` `border` | hover focus press active open disabled |
| `button.frame` |  | `bg` `text` `border` | hover focus press active open disabled |
| `button.link` |  | `bg` `text` `border` | hover focus press active open disabled |
| `iconButton` | A button that holds only an icon (copy, close, menu): square by default | `radius` `icon` | hover focus press active open disabled |
| `copy` | CopyButton | `radius` | hover focus press active open disabled |
| `close` | The close button of a dialog, sheet, drawer, alert or side nav | — | hover focus press active open disabled |
| `link` | Link: the text link with the drawn underline | — | hover focus press active open disabled |
| `link.underline` |  | `color` `width` `offset` | hover focus |
| `nav` | Nav: the row or column of links with the sliding bar | — | — |
| `nav.item` |  | — | hover focus press active open disabled |
| `nav.underline` |  | `color` `width` `duration` | — |
| `tabs` | Tabs | — | — |
| `tabs.tab` |  | `radius` | hover focus press active open disabled |
| `tabs.underline` |  | `color` `width` | — |
| `pill` | Pill and PillLink | `radius` | hover focus press active open disabled |
| `badge` | Badge | — | hover focus press active open disabled |
| `chip` | Chip | `radius` | hover focus press active open disabled |
| `card` | Card and Surface | — | hover focus press active open disabled |
| `field` | Text fields, selects and pickers | `bg` `radius` | hover focus press active open disabled |
| `field.label` |  | `text` | hover focus |
| `sweep` | The sweep: the stroke that draws round a control on hover and focus, and the text while it runs | `stroke` `base` `text` `width` `duration` | — |
| `dialog` | Modal and Dialog | — | — |
| `sheet` | Sheet and Drawer | — | — |
| `popover` | Popover, Menu and Tooltip panels | — | — |
| `toast` | Toast | — | — |

A solid's `bg` and `text` move its tone channels, so hover, pull-out and sweep follow. `hover.bg` is the hover fill. Text
set on a fill set in the same part is checked like a seed: below 4.5:1 is D010. Each named theme's seed is fitted the
same way as the main one.

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
