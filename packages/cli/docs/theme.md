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
| `system` | The scales: `radius`, `space`, `pad`, `control`, `font`, `shadow`, `duration`, `ease`, `border`, `icon`, `text.<role>` (warp's roles or your own, below) |
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

## Text roles

`system.text` retunes warp's roles (`display title heading body label caption eyebrow code prose control button`) and
names your own. Each property becomes a token, `--warp-text-<role>-<property>`. A role of your own also gets a rule, so
`<Text role="narrative">` or any element with `data-scope="text" data-role="narrative"` takes it:

```ts
warp({
  system: {
    text: {
      display: { size: 72, weight: 700, leading: 0.9 },
      narrative: {
        size: 28,
        leading: 0.96,
        tracking: '-0.05em',
        font: '"Fraunces", "Fraunces Fallback", Georgia, serif',
      },
    },
  },
})
```

The properties are `size weight leading tracking case font`. A number is px for `size` and `tracking`. A role's name is
lowercase. warp's own roles take only the tokens warp has for them.

Any property can change with the viewport: `base` holds below the first breakpoint, and each other key is a min-width
in px. `size` and `tracking` can also be fluid, `{ min, max, from, to }` in px: `min` at the `from` width, `max` at
`to`, held outside them. Inside a breakpoint, `from` is the breakpoint. Each breakpoint is a media query that sets the
tokens, so there is no script; a fluid line runs on `vw` to meet them, in the user's rem (`--warp-rem`). A page that
imports `weft:tokens/warp` without warp's stylesheet gets `--warp-rem: 1rem` from the tokens, so its fluid sizes
hold, and `<Heading>` and `<Text>` bring only their role rules there, not warp's sheet.

```ts
warp({
  system: {
    text: {
      // 72 below 768, then 120 at 768 to 220 at 1680
      display: {
        size: { base: 72, 768: { min: 120, max: 220, to: 1680 } },
      },
      body: { size: { base: 16, 768: 14 } },
    },
  },
})
```

## Motion tokens

`system.duration` and `system.ease` retune warp's steps (`instant fast base slow`) and curves (`in out in-out pop
spring sheet`) and name your own. Each becomes `--warp-duration-<name>` or `--warp-ease-<name>`. A duration is ms for a
number and exact: no dial rescales it. A curve is a CSS easing or cubic-bezier handles, `[x1, y1, x2, y2]`. A part's
`duration` and `easing` take the names:

```ts
import { defineConfig } from '@weft-js/core/config'
import { warp } from '@weft-js/warp/plugin'
import { ui } from './src/motion'

export default defineConfig({
  plugins: [
    warp({
      system: {
        duration: { state: 150, glide: 300 },
        ease: { ui, scrub: [0.65, 0, 0.35, 1] },
      },
      parts: { button: { duration: 'state', easing: 'ui' } },
    }),
  ],
})
```

Your own CSS reads them as `transition: opacity var(--warp-duration-glide) var(--warp-ease-ui)`. The handles are the
shape a scroll timeline's key takes, so one constant serves both:

```ts
// src/motion.ts
import { timeline } from '@weft-js/scroll/timeline'

export const ui = [0.4, 0, 0.2, 1] as const
export const reveal = timeline({ opacity: [[0, 0], [1, 1, ui]] })
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
