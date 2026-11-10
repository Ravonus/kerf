<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/warp-icons</h1>

<p align="center">
  <strong>651 original icons for Weft, in Warp's three expression tiers, each with a hollow and a solid form.</strong><br>
  The build ships only the icons your code names, and a misspelt name fails the build with the closest match.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/warp-icons"><img src="https://img.shields.io/npm/v/@weft-js/warp-icons?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/weft/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/weft/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/weft/quality.yml?branch=main&label=checks" alt="checks"></a>
  <img src="https://img.shields.io/badge/icons-651-145c3c" alt="651 icons">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/weft/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md) before you upgrade.

warp-icons is Weft's own icon set. Every icon is drawn three times, once per Warp expression tier: a thin outline at
`quiet`, a heavier outline with dither shading at `balanced`, and pixel art on a 16×16 grid at `vivid`. Each tier has a
hollow and a solid form, drawn apart rather than one filled from the other. CSS shows the tier that matches the page,
with no script.

[`@weft-js/warp`](https://www.npmjs.com/package/@weft-js/warp) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp)</sup> depends on it, so an app with Warp already
has it. It also works on its own in any Weft app.

## Highlights

- **Original art, MIT licensed.** Nothing is copied, traced or adapted from another set, and nothing carries another
  set's licence. The source art is in this repo.
- **Pay per icon.** An icon you don't import costs nothing; one you do adds about 164 B of brotli with all three tiers.
- **Typed names, checked at build.** `<Icon name>` is typed. In untyped code the build and `weft check` report a wrong
  name as I001 with the closest real one.
- **Dynamic names still work.** A name only known at run time loads the pack as its own lazy chunk, or single SVG
  files from a URL you choose.
- **Accessible by default.** Icons are decorative (`aria-hidden`) until you give one a `label`, which makes it
  `role="img"` with that name.
- **Five icons that move.** `trash`, `bell`, `check`, `refresh` and `copy` have CSS-only animations that respect reduced
  motion.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Guide](#guide)
  - [Three ways to import](#three-ways-to-import)
  - [Props](#props)
  - [Names and variants](#names-and-variants)
  - [How names are resolved](#how-names-are-resolved)
  - [Names from data](#names-from-data)
  - [Tiers](#tiers)
  - [Action icons](#action-icons)
  - [Styling](#styling)
- [The set](#the-set)
- [How the icons are made](#how-the-icons-are-made)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [Contributing](#contributing)
- [License](#license)

## Install

In a Weft app, let the CLI install it and add `icons()` to your config:

```bash
npx weft add icons
```

Or install it yourself:

```bash
npm install @weft-js/warp-icons
```

```bash
pnpm add @weft-js/warp-icons
```

```bash
bun add @weft-js/warp-icons
```

The plugin is optional. Without it every icon carries its three tiers and follows the page's `data-expression`.

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import { icons } from '@weft-js/warp-icons/plugin'

export default defineConfig({ plugins: [icons()] })
```

`@weft-js/core` and `vite` are peer dependencies: icons are Weft components, and the name pass runs in Weft's Vite
plugin. Node 24 or later is required.

## Quick start

```tsx
import { CheckIcon } from '@weft-js/warp-icons'

export function Saved() {
  return (
    <p>
      <CheckIcon label="Saved" /> Your changes are saved.
    </p>
  )
}
```

## Guide

### Three ways to import

All three build to the same bytes:

```tsx
// A named export: the plainest form.
import { CheckIcon } from '@weft-js/warp-icons'
<CheckIcon />

// The pack, as a namespace.
import Icons from '@weft-js/warp-icons'
<Icons.Check />

// By name. Also exported from @weft-js/warp-icons/icon.
import { Icon } from '@weft-js/warp'
<Icon name="check" />
```

`sideEffects` lists only CSS, so a named import ships that icon and nothing else.

### Props

Every icon takes the same props. Anything else lands on the `<svg>`.

| Prop | Type | Default | What it does |
|---|---|---|---|
| `label` | `string` | | An accessible name: the icon becomes `role="img"`. Without one it is `aria-hidden="true"` and `focusable="false"` |
| `size` | `number \| string` | Warp's icon sizes | Width and height, in px or any CSS length |
| `tier` | `'quiet' \| 'balanced' \| 'vivid'` | the page's `data-expression` | Shows this tier whatever the page's expression is |
| `style` | `string` | | Inline CSS; `size` goes in front of it |

`<Icon>` adds `name` (an icon name or the icon component itself), `solid`, and `action` for the five action icons.

```tsx
<CheckIcon />                  // decorative
<CheckIcon label="Saved" />    // role="img" with that name
<CheckIcon size={24} />        // otherwise Warp's icon sizes apply
<CheckIcon tier="vivid" />     // this tier regardless of the page
```

### Names and variants

One naming scheme, generated from the art together with its types:

| Export | Pack | `<Icon>` | What it is |
|---|---|---|---|
| `BellIcon` | `Icons.Bell` | `name="bell"` | Hollow, the default |
| `BellIconHollow` | `Icons.BellHollow` | | The same, by name |
| `BellIconSolid` | `Icons.BellSolid` | `solid` | The solid form |
| `BellIconAction` | `Icons.BellAction` | `action` | The animated form (action icons only) |

The tier is a prop, never a name. Hollow and solid describe the object: an icon with a body, such as a cart, is that
body drawn round or filled; an open mark, such as an arrow, is its strokes thickened into a shape, outlined in hollow and
filled in solid.

### How names are resolved

Weft's Vite plugin runs this package's name pass (`@weft-js/warp-icons/compile`) over your sources at build time. It
parses each file and follows every icon name to the literals it can be: through variables, conditionals, static lists
and maps, imports, and props handed down through components.

- **A literal name** compiles to the icon itself. `<Icon name="check" />` ships `CheckIcon` and nothing more.
- **An unknown literal name** fails the build:

  ```text
  I001 no icon 'chekc', did you mean 'check'?
  ```

  So does a variant an icon doesn't have, such as `action` on an icon that doesn't move.
- **A name it can't follow**, such as one from an API, is legal. `weft check` reports it as I002 with the file and the
  cost, or I003 if the pack itself is passed around. See [Names from data](#names-from-data).

The same pass runs in `vite build` and `weft check`. In development and tests, `@weft-js/warp-icons/names` holds every
icon; a build swaps it for a module holding only the names your app uses.

### Names from data

A use whose name the build can't bound gets one of two things.

**The pack, as its own chunk.** The default. It is about 111 KB of brotli for all 651 icons with every tier, loaded only
by a page that reaches it. A page with a dynamic name stays about 1.6 KB bigger than one without.

**Single icons from a URL.** Point `icons()` at a host of static files. Nothing of the pack is built; each icon is
fetched the first time it is drawn.

```ts
import { icons } from '@weft-js/warp-icons/plugin'

export default {
  plugins: [icons({ source: 'https://cdn.example.com/icons/' })],
}
```

`weft icons publish <dir>` writes every icon and variant as a static `.svg` file with a `manifest.json`, ready for that
host. It writes files and uploads nothing. Action icons aren't published.

A remote icon renders an empty `<svg data-icon data-loading>` of the right size until it arrives, then swaps in with no
layout shift. If the fetch fails it carries `data-failed` and the page carries on. On the server it stays empty, so SSR
needs no network. Only `<path>` elements with their `d`, `data-*` and `translate()` attributes are kept from the
response, so what a host sends is data, never markup that can run. A Content-Security-Policy needs the host in
`connect-src`.

For a fixed list of names that come from data, `iconSet` keeps names typed and everything else tree-shakeable:

```tsx
import { CheckIcon, XIcon, iconSet } from '@weft-js/warp-icons'

const StatusIcon = iconSet({ ok: CheckIcon, failed: XIcon })

<StatusIcon name={job.status} label={job.status} />
```

`@weft-js/warp-icons/all` is the same over every icon (`icons`, `lookup`, `names`, `Icon`), for an app that takes any
name from data and accepts the whole set.

### Tiers

| Tier | Drawing |
|---|---|
| `quiet` | A thin outline, restrained, no shading. Solid is a flat mass with a fine cut |
| `balanced` | A heavier outline with the weft stroke plain to see and dither depth on the shadow side. Solid is lit, with an offset shade |
| `vivid` | Pixels on the 16 grid, shaded with dither, with Warp's notch |

With no options each icon carries its tiers and CSS shows the one for the nearest `data-expression`. Switching needs no
script, doesn't flash and doesn't change the box. A nested `data-expression` is honoured, and a page without Warp shows
`balanced`. The build keeps only the tiers your config and `data-expression` attributes name.

To compile one tier in with no switch, name it:

```ts
import { icons } from '@weft-js/warp-icons/plugin'

export default { plugins: [icons({ tier: 'vivid' })] }
```

`@weft-js/warp-icons` then resolves to that tier alone, and Warp's own icons follow it too. After that a page's
`data-expression` no longer changes icons; run `weft plugins sync` if you change the tier.

The pixel tier is exact at 16, 32 and 48 px. At 20 and 24 px a 1× screen rounds cells unevenly; a 2× screen draws 24
evenly. Prefer 16 or 32 at `vivid`.

### Action icons

Five icons have a built-in animation: `trash` (the lid lifts), `bell` (it rings), `check` (it draws on), `refresh` (it
spins) and `copy` (the sheet stacks).

```tsx
import { Icon } from '@weft-js/warp'
import { TrashIconAction } from '@weft-js/warp-icons'

// Animates on hover, focus and press of the icon or its parent
<Icon name="trash" action />
<Icon name="refresh" action="on" />     // now; refresh keeps spinning
// action: 'hover' | 'focus' | 'press' | 'on'
<TrashIconAction action="press" />
```

It is CSS alone, and each one's stylesheet ships only if that icon is used: about 230 B of CSS and 50 B of JS, brotli.
Outlines ease; pixels move in whole cells, in frames. Warp's motion dial and `prefers-reduced-motion` turn it off. An
action on any other icon is I001.

### Styling

Icons draw in `currentColor`. The weft stroke, the one that says what the icon means, is `[data-w]`, so you can colour it
apart:

```css
svg [data-w] { stroke: var(--warp-color-accent-text); }
```

| Custom property | What it does |
|---|---|
| `--warp-icon-weft` | The weight of the weft stroke |
| `--warp-icon-knock` | The colour a solid cuts its marks with. Defaults to `Canvas`; on a coloured surface such as a solid button, set it to that surface's colour |

## The set

651 icons, in twelve groups of source art:

| Group | Icons | Group | Icons |
|---|---|---|---|
| Marks | 32 | Navigation | 68 |
| Status | 20 | Actions | 80 |
| People | 34 | Files and media | 73 |
| Files | 35 | Comms and commerce | 80 |
| Things | 33 | Data and dev | 92 |
| Agent | 6 | World | 98 |

Browse them all on the contact sheet: `pnpm run sheet` in this package writes `contact-sheet.html`, one static file with
controls for tier, form, size, theme and accent, and a search. `weft docs icons` prints the reference in your terminal;
its source is [packages/cli/docs/icons.md](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/icons.md).

**Licence.** The icons are MIT licensed, like the rest of Weft. They are original work: the rules in
[docs/design/warp/10-icons.md](https://github.com/Ravonus/weft/blob/main/docs/design/warp/10-icons.md) state that nothing
is copied, traced or adapted from another set.

## How the icons are made

The icons are generated, not hand-exported. One source produces every tier, form, export and type, so they can't drift.

```text
art/*.mjs ──scripts/build.mjs──▶ src/gen/*.tsx
                                  one component per icon and variant
                                  src/gen/names.ts
                                  IconName, IconVariant, the actions
                                  per-action CSS
```

- **Source art** is in [`art/`](https://github.com/Ravonus/weft/tree/main/packages/warp-icons/art). Each entry is a pair:
  an outline in a small drawing language, and a 16×16 pixel grid drawn as text.

  ```js
  'arrow-up': [
    '/ ln 7,13 7,1; ln 2,6 7,1 12,6',
    `
  .
  ......##
  .....####
  ....######
  ...
  `,
  ],
  ```

- **The drawing language** (`scripts/draw.mjs`) uses 16-unit coordinates, where `u` is the centre of pixel `u` at 16 px,
  so every straight stroke lands on one pixel row at Warp's default size. An outline reads `body / weft`: the strokes
  before the slash draw the object, the ones after it the weft stroke (`[data-w]`). Commands are separated by `;`. The
  operations are `ln` (a line), `pl` (a polyline with rounded corners), `pg` (a closed polygon), `sg` (a sharp closed
  mark), `rect`, `box` (a rectangle with Warp's notch), `ring`, `circ`, `dot` and `p` (a raw path).
- **Forms** (`scripts/forms.mjs`) build hollow and solid for each tier. Hand-drawn pixel masters in `art/style/` cover the
  icons a derived grid can't shade well, and `art/style/solid.mjs` places the highlight cut into each solid outline.
- **Actions** are in `art/actions/`, each with its own keyframes and pixel frames.
- **Checks.** `pnpm test` runs `scripts/build.mjs --check`, which fails if `src/gen` is stale, then the tests: the art
  holds to its rules, generated modules stay complete and match their art, and the name pass ships what it should.
  `scripts/distinct.mjs` renders each icon in Chromium at 16 and 24 px and checks that forms and tiers actually look
  different.

## API reference

| Import | What it has |
|---|---|
| `@weft-js/warp-icons` | Every icon as `XIcon`, `XIconHollow`, `XIconSolid`, and `XIconAction` for the five action icons; the pack as the default export; `iconSet`; the `IconComponent`, `IconProps`, `ActionIconProps` and `IconTrigger` types |
| `@weft-js/warp-icons/icon` | `Icon`: an icon by name; the `IconName`, `IconVariant` and `IconRef` types |
| `@weft-js/warp-icons/all` | `icons` (every icon by name), `lookup`, `names`, `actions`, `Icon`. Costs the whole set |
| `@weft-js/warp-icons/names` | `resolve(name, variant?)` and `pack(id)`. A build replaces this module with one that knows only your app's names |
| `@weft-js/warp-icons/late` | `late` and `remote`: the lazy-pack and remote-URL loaders the build wires in for dynamic names |
| `@weft-js/warp-icons/quiet`, `/balanced`, `/vivid` | What `@weft-js/warp-icons` resolves to when `icons({ tier })` pins a tier |
| `@weft-js/warp-icons/plugin` | `icons({ tier?, source? })` for `weft.config.ts` (also the default export) |
| `@weft-js/warp-icons/compile` | The build's name pass: `pass`, `analyze`, `rewrite`, `findings`, `unknownMessage`, `publish`, `packCost`, `trimTiers`, `list`, `STOPS` |
| `@weft-js/warp-icons/icons.css` | The base rule for every icon, so the set works without Warp |
| `@weft-js/warp-icons/tiers.css` | The runtime tier switch keyed on `data-expression` |

`icons()` options:

| Option | Values | Default | What it does |
|---|---|---|---|
| `tier` | `quiet` · `balanced` · `vivid` | every tier, switched by CSS | Compiles one tier in |
| `source` | an `http(s)` URL ending in `/` | | Dynamic names load single SVG files from here instead of the pack |

Any other key is rejected with `unknown option`.

## Troubleshooting

**`I001 no icon '…', did you mean '…'?`** The name isn't in the set. Use the suggestion, or browse the contact sheet.

**`I001 no action for icon '…'`.** Only `trash`, `bell`, `check`, `refresh` and `copy` take `action`.

**I002 in `weft check`.** A name the build can't follow. It works, but that page loads the pack chunk (about 111 KB
brotli) or, with `icons({ source })`, single files. Make the name a literal, or narrow it with `iconSet`, to ship only the
icons you use.

**Icons don't change with `data-expression`.** A pinned `icons({ tier })` compiles one tier in. Remove it, or run
`weft plugins sync` after changing it.

**Remote icons stay empty.** Check the host serves `<name>.svg` (and `<name>.solid.svg`) under the `source` URL, and that
your Content-Security-Policy lists it in `connect-src`. A failed fetch marks the icon `data-failed`.

**Solid icons look wrong on a coloured button.** Set `--warp-icon-knock` to the button's fill.

**Pixel icons look uneven at 20 or 24 px.** The vivid tier is exact at 16, 32 and 48 px.

## Related packages

| Package | What it is |
|---|---|
| [`@weft-js/warp`](https://www.npmjs.com/package/@weft-js/warp) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp)</sup> | Warp's components; its `Icon` and every icon inside a component come from here |
| [`@weft-js/warp-core`](https://www.npmjs.com/package/@weft-js/warp-core) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp-core)</sup> | Warp's behaviour, tokens and CSS, with no framework |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/core)</sup> | The Weft runtime and Vite plugin that runs the name pass |
| [`@weft-js/cli`](https://www.npmjs.com/package/@weft-js/cli) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/cli)</sup> | `weft add icons`, `weft check`, `weft icons publish`, `weft docs icons` |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). In `packages/warp-icons`:

```bash
pnpm run build   # art/*.mjs → src/gen
pnpm test        # fails if src/gen is stale, then vitest
pnpm run sheet   # writes contact-sheet.html
```

New art follows [docs/design/warp/10-icons.md](https://github.com/Ravonus/weft/blob/main/docs/design/warp/10-icons.md).
Never edit `src/gen` by hand.

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
