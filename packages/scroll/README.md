<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/scroll</h1>

<p align="center">
  <strong>Scrolling run in JavaScript, with bars drawn in the DOM or on a canvas.</strong><br>
  Wheel, trackpad, touch, keys and focus behave like native scrolling, the same in every browser, and every part of the bar is yours to style.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/scroll"><img src="https://img.shields.io/npm/v/@weft-js/scroll?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/weft/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/weft/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/weft/quality.yml?branch=main&label=checks" alt="checks"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D26-145c3c" alt="Node 26 or later">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#api">API</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/weft/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md) before you upgrade.

Native scrollbars look different on every system, can't be given a fixed-size thumb, and can't be drawn the way a
design asks. Libraries that replace them usually move the content with a transform, and lose what the browser did
for free: focus scrolling into view, find-in-page, anchors, sticky headers, screen readers, and every library that
listens for `scroll`.

`@weft-js/scroll` keeps the browser's scroll offsets. The viewport is still a real scroll container, set to
`overflow: hidden`, and the engine writes `scrollTop` and `scrollLeft` itself. Input runs in JavaScript, so it
feels the same in Chrome, Firefox and Safari, and the bars are plain elements or a canvas that you style or paint.
Nothing in it imports a framework. Warp's [`ScrollView`](https://github.com/Ravonus/weft/blob/main/packages/warp/src/ScrollView.tsx)
is the Weft component over it.

## Highlights

- **Native feel.** Notched wheels animate each step, trackpad pixels apply as they come (the OS's momentum
  included), touch drags coast with inertia and rubber-band past the edges, and `deltaMode` lines and pages are
  converted as browsers do.
- **The keys browsers use.** Arrows, Page Up and Page Down, Home and End, Space and Shift+Space, with the same step
  sizes. A key the area can't act on reaches the page.
- **Nothing the browser does is lost.** Focus moving into view, find-in-page, anchors, `position: sticky`,
  `Element.scrollIntoView` and screen readers all work, because the offsets are real.
- **Nested areas hand off.** A gesture latches to the area it started in; one that starts at an edge goes to the
  area outside, or to the page, as native scrolling chains.
- **Any bar you like.** A fixed-size thumb, min and max sizes, colours, radius, width, inset, hover and active
  states, auto-hide timing, overlay or gutter. Or paint the bar on a canvas with your own `draw`.
- **Behaviour you can tune.** Easing, duration, friction, momentum, wheel speed and snap points.
- **Long lists.** The viewport fires `scroll` in the same frame it moves, so a virtualizer draws with it. A test
  scrolls 100,000 rows on Warp's virtualizer.
- **Right to left, reduced motion, accessibility.** `scrollLeft` runs negative in RTL as the DOM's does; reduced
  motion makes animated scrolls instant; the bars are `scrollbar`s with values, and axe finds nothing to fix.

## Contents

- [When to use it](#when-to-use-it)
- [Install](#install)
- [Quick start](#quick-start)
- [Guide](#guide)
  - [How it works](#how-it-works)
  - [Markup](#markup)
  - [In Weft: Warp's ScrollView](#in-weft-warps-scrollview)
  - [In another framework](#in-another-framework)
  - [A fixed-size thumb](#a-fixed-size-thumb)
  - [Styling the bars](#styling-the-bars)
  - [Bars on a canvas](#bars-on-a-canvas)
  - [Feel: easing, friction, momentum](#feel-easing-friction-momentum)
  - [Snap points](#snap-points)
  - [Nested areas](#nested-areas)
  - [Long lists](#long-lists)
  - [Keys, focus and accessibility](#keys-focus-and-accessibility)
- [API](#api)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [Contributing](#contributing)
- [License](#license)

## When to use it

| You want | Use |
|---|---|
| A panel, list or log whose bar looks the same everywhere, or is drawn your way | This package, or Warp's `ScrollView` in a Weft app |
| The page's own scrollbar restyled below a sticky header | Warp's `ScrollRail`: the document keeps native scrolling |
| A thin native bar, with no change to how scrolling works | CSS: `scrollbar-width` and `scrollbar-color` |
| Scrolling that keeps going while the main thread is busy | Native scrolling: it runs on the compositor (see [Performance](#performance)) |

## Install

```bash
npm install @weft-js/scroll
```

```bash
pnpm add @weft-js/scroll
```

```bash
bun add @weft-js/scroll
```

> [!NOTE]
> The package exports TypeScript source (`src/index.ts`), so your bundler must compile TypeScript from
> `node_modules`. It has no dependencies. Node 26 or later is required to install it.

## Quick start

With no framework: `wrap` turns an element's children into a scroll area in place.

```ts
import { wrap } from '@weft-js/scroll'
import '@weft-js/scroll/styles.css'

const log = document.querySelector<HTMLElement>('#log')!
const area = wrap(log, {
  label: 'Build log',
  thumb: { size: 32 },
  bar: { show: 'always', color: 'rgb(20 92 60)' },
})

area.scrollTo({ top: 0, behavior: 'smooth' })
```

```html
<div id="log" style="height: 320px">
  <p>Build 1 passed</p>
  <p>Build 2 passed</p>
</div>
```

Give the area a height, as you would any scroller.

## Guide

### How it works

The root is `position: relative; overflow: hidden`. Inside it the viewport fills the root and is a scroll container
with `overflow: hidden`, so the browser draws no bar and handles no wheel, touch or key input, but still scrolls it
for focus, find, anchors and `scrollIntoView`. The engine listens for input, animates a position, and writes it to
`scrollTop` and `scrollLeft` once per frame. When the browser moves the viewport itself, the engine adopts the new
position and the bar follows.

Before the script runs, the stylesheet leaves the viewport on `overflow: auto`, so server-rendered HTML scrolls
natively until the engine takes over.

### Markup

`scroller(root, options)` expects this, and makes any bar that is missing:

```html
<div id="area" style="height: 320px">
  <div data-part="viewport">
    <div data-part="content">…</div>
  </div>
  <div data-part="scrollbar" data-orientation="vertical">
    <div data-part="thumb"></div>
  </div>
  <div data-part="scrollbar" data-orientation="horizontal">
    <div data-part="thumb"></div>
  </div>
</div>
```

```ts
import { scroller } from '@weft-js/scroll'
import '@weft-js/scroll/styles.css'

const area = scroller(document.querySelector('#area')!, {
  axes: 'y',
})
```

The content element is what moves when the area rubber-bands, and what a `ResizeObserver` watches for size changes.
Swap it and the engine watches the new one.

### In Weft: Warp's ScrollView

```tsx
import { ScrollView } from '@weft-js/warp'

export function Log({ lines }: { lines: string[] }) {
  return (
    <ScrollView
      label="Build log"
      axes="y"
      thumb={{ size: 32 }}
      style="height:320px"
    >
      {lines.map((l) => (
        <p>{l}</p>
      ))}
    </ScrollView>
  )
}
```

Every option is a prop. `controller` receives the scroller, for `scrollTo` and the rest. The bars take Warp's ink,
focus ring and timing. Server HTML scrolls natively until the island runs.

### In another framework

The scroller is an action: make it on mount, `update` it when options change, `destroy` it on unmount. In React:

```tsx
import { useEffect, useRef } from 'react'
import { scroller, type ScrollOptions } from '@weft-js/scroll'

export function Scroll(props: {
  options: ScrollOptions
  children: React.ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const s = scroller(root.current!, props.options)
    return () => s.destroy()
  }, [])
  return (
    <div ref={root} style={{ height: 320 }}>
      <div data-part="viewport">
        <div data-part="content">{props.children}</div>
      </div>
    </div>
  )
}
```

### A fixed-size thumb

A native thumb grows and shrinks with the content. `thumb.size` fixes its length; `min` and `max` bound a
proportional one instead.

```ts
scroller(el, { thumb: { size: 28 } })
scroller(el, { thumb: { min: 40, max: 120 } })
```

### Styling the bars

Each `bar` option sets a custom property on the root, and the stylesheet reads only those. So CSS can set them too,
on any element above the area, in any layer: the stylesheet declares none of them itself.

| Option | Custom property | Default |
|---|---|---|
| `width` | `--scroll-width` | `6` px |
| `hoverWidth` | `--scroll-hover-width` | `10` px |
| `inset` | `--scroll-inset` | `2` px |
| `radius` | `--scroll-radius` | half the width |
| `color` | `--scroll-color` | 32% of the text colour |
| `hoverColor` | `--scroll-hover-color` | 48% of the text colour |
| `activeColor` | `--scroll-active-color` | 60% of the text colour |
| `track` | `--scroll-track` | `transparent` |
| `hoverTrack` | `--scroll-hover-track` | 8% of the text colour |
| `fade` | `--scroll-fade` | `200` ms |

The rest of `bar` is behaviour:

| Option | Values | Default |
|---|---|---|
| `show` | `scroll` (while moving or hovered), `hover` (while the pointer is over the area), `always`, `never` | `scroll` |
| `hideDelay` | ms the bar stays after scrolling stops | `900` |
| `layout` | `overlay` over the content, or `gutter` beside it | `overlay` |
| `trackClick` | `page` (held, it repeats) or `jump`; Alt flips it | `page` |

The elements carry state for CSS: `data-visible`, `data-hover`, `data-active` and `data-none` on each bar;
`data-scrolling`, `data-overflow-x` and `data-overflow-y` on the root.

```css
#area {
  --scroll-color: rgb(20 92 60 / 0.5);
  --scroll-hover-color: rgb(20 92 60);
  --scroll-radius: 2px;
}
```

### Bars on a canvas

`canvas()` from `@weft-js/scroll/canvas` paints each bar into its own canvas, at the device's pixel ratio. Colours
resolve through the same custom properties, so `color-mix()` and `currentColor` work. Pass `draw` to paint it
yourself; `paint` is the default look, to draw over or ignore.

```ts
import { scroller } from '@weft-js/scroll'
import { canvas } from '@weft-js/scroll/canvas'

scroller(el, {
  renderer: canvas({
    draw(ctx, frame, paint) {
      paint(ctx, frame)
      const { x, y, width, height } = frame.thumb
      ctx.fillStyle = 'white'
      ctx.fillRect(x, y + height / 2 - 1, width, 2)
    },
  }),
})
```

`frame` holds the track's size, the thumb's box, `grow` (0 at rest to 1 hovered, eased), `hover`, `active`,
`progress`, `rtl` and the resolved `bar` options. A frame is drawn only when one of them changed. Pointer handling
doesn't depend on the renderer, so a painted bar drags and pages like a DOM one. A renderer of your own implements
`Renderer`: `mount`, `draw` and `unmount`.

### Feel: easing, friction, momentum

| Option | What it does | Default |
|---|---|---|
| `duration` | ms for a wheel notch, a key and a smooth `scrollTo` | `220` |
| `easing` | `(t) => progress`; `easings` has `linear`, `easeOut`, `easeOutQuint`, `easeInOut`, `expo` | `easeOut` |
| `friction` | share of a fling's velocity kept per ms | `0.998` |
| `momentum` | coast after a touch fling | `true` |
| `overscroll` | `bounce` past the edges on touch, or `none` | `bounce` |
| `wheelSpeed` | multiplies wheel distance | `1` |
| `lineHeight` | px for a wheel line and an arrow key | `40` |
| `grab` | drag the content with a mouse, as a hand tool | `false` |
| `touch` | `js` runs touch here; `native` leaves it to the browser | `js` |

```ts
import { easings, scroller } from '@weft-js/scroll'

scroller(el, {
  duration: 400,
  easing: easings.easeOutQuint,
  friction: 0.995,
})
```

### Snap points

Like CSS scroll snapping. `mandatory` always rests on a point; `proximity` only when within `proximity` px (120 by
default). A fling glides to the point nearest where it would have stopped, and a wheel notch or an arrow key moves
one point under `mandatory`.

```ts
scroller(el, {
  axes: 'x',
  snap: {
    selector: '[data-slide]',
    align: 'start',
    type: 'mandatory',
    axis: 'x',
  },
})
```

`points` takes positions in px, or a function returning them, read again whenever the area resizes.

### Nested areas

An area inside another scrolls first. A gesture latches to the area it started in for as long as it continues, as
browsers do: one that reaches the inner edge midway stops there, and the next gesture at that edge moves the outer
area, or the page. A natively scrolling element inside an area keeps its own scrolling. `chain: 'contain'` keeps
every gesture in the area, like `overscroll-behavior: contain`.

### Long lists

The engine fires a `scroll` event on the viewport in the frame it writes a position (`syncEvents`, on by
default), so a virtualizer listening for `scroll` places its rows before that frame paints. Hand the viewport to
the virtualizer as its scroller:

```ts
import { scroller } from '@weft-js/scroll'
import { virtualizer } from '@weft-js/warp-core'

const area = scroller(root)
const list = virtualizer(area.viewport, {
  keys,
  spacer,
  estimate: 32,
  onRange: render,
})
```

### Keys, focus and accessibility

- **Keys:** arrows scroll a line, Page Up and Page Down most of a screen, Space and Shift+Space the same, Home and
  End to the ends. Keys typed into fields, and arrows inside widgets that use them (listbox, grid, slider…), are
  left alone.
- **Focus:** the viewport is a tab stop only when nothing inside it can take focus, as browsers treat scrollers. A
  click in it focuses it, so the keys work after a click.
- **Screen readers:** the content stays in the DOM and the accessibility tree. With `label`, the viewport is a
  named `region`. Each bar is a `scrollbar` with `aria-valuenow` (0 to 100), `aria-orientation` and
  `aria-controls`.
- **Reduced motion:** with `motion: 'auto'` (the default) and `prefers-reduced-motion: reduce`, animated scrolls
  are instant, bars stop fading and touch doesn't rubber-band.
- **Right to left:** `x` and `scrollLeft` run from 0 to negative, as the DOM's do. The vertical bar sits at the
  inline end and the horizontal thumb starts from the right.
- **Selection:** dragging a text selection past the edge scrolls toward it, faster further out, and the selection
  follows. Dragging a file or element over an edge does the same.

## API

### `scroller(root, options?)`

Starts the engine on `root` and returns a `Scroller`. Calling it again on the same root replaces the first.

### `wrap(el, options?)`

Moves `el`'s children into a viewport and content wrapper, then calls `scroller(el)`. `destroy` puts them back.

### Options

| Option | Type | Default |
|---|---|---|
| `axes` | `'x' \| 'y' \| 'both'` | `'both'` |
| `thumb` | `{ size?, min?, max? }` | proportional, `min` 24 |
| `bar` | `BarOptions` ([Styling the bars](#styling-the-bars)) | see above |
| `renderer` | `Renderer` | DOM bars |
| `duration`, `easing`, `friction`, `momentum` | see [Feel](#feel-easing-friction-momentum) | |
| `wheelSpeed`, `lineHeight`, `overscroll`, `grab`, `touch` | see [Feel](#feel-easing-friction-momentum) | |
| `chain` | `'auto' \| 'contain'` | `'auto'` |
| `snap` | `{ points?, selector?, align?, type?, proximity?, axis? }` | none |
| `keyboard` | `boolean` | `true` |
| `autoscroll` | `boolean`: selection and drag autoscroll | `true` |
| `motion` | `'auto' \| 'reduce' \| 'full'` | `'auto'` |
| `label` | `string`: the viewport's accessible name | none |
| `syncEvents` | `boolean`: fire `scroll` in the frame of each write | `true` |
| `onScroll` | `(state: ScrollState) => void`, once per frame that moved | none |

### `Scroller`

| Member | What it does |
|---|---|
| `state()` | The current `ScrollState` |
| `scrollTo({ top?, left?, behavior? })` | Moves there; at once unless `behavior: 'smooth'` |
| `scrollBy({ top?, left?, behavior? })` | Moves by that much, from where a running animation is heading |
| `scrollIntoView(el, { block?, inline?, behavior?, margin? })` | Brings `el` into view in this area only |
| `stop()` | Stops an animation or a coast where it is |
| `refresh()` | Measures again, after a change no `ResizeObserver` sees |
| `update(options)` | Merges new options in |
| `destroy()` | Removes listeners, bars it made and attributes |
| `viewport` | The viewport element |

### `ScrollState`

| Field | What it is |
|---|---|
| `x`, `y` | `scrollLeft` and `scrollTop` |
| `maxX`, `maxY` | The furthest each goes (`maxX` negative in RTL) |
| `progressX`, `progressY` | 0 at the start to 1 at the end |
| `overscrollX`, `overscrollY` | Rubber-band offset past an edge, px |
| `velocityX`, `velocityY` | px per ms |
| `source` | `wheel`, `touch`, `key`, `bar`, `api`, `snap`, `select` or `native` |

### Helpers

Pure functions the engine uses, exported for your own bars and tests: `thumbLength`, `thumbOffset`, `dragRatio`,
`progressAt`, `snapTo`, `snapStep`, `normalizeWheel`, `pageStep`, `coastDistance`, `rubber`, `easings`.

### Entries

| Entry | What it has |
|---|---|
| `@weft-js/scroll` | `scroller`, `wrap`, `domRenderer`, the helpers and the types |
| `@weft-js/scroll/canvas` | `canvas`, `paintBar`, `cssColor` |
| `@weft-js/scroll/styles.css` | The layout and look of the root, viewport and bars |

## Performance

`node bench/native.mjs` in this package compares the browser's own scrolling with this package's DOM and canvas
bars, in headless Chromium on an M4 Max, median of 5 runs:

| | Native | DOM bars | Canvas bars |
|---|---|---|---|
| Mount 200 areas of 50 rows, with layout | 6.5 ms | 18 ms | 20 ms |
| Main-thread time per frame during a 2 s trackpad stream | 0.18 ms | 0.28 ms | 0.26 ms |
| Frames over 20 ms in that stream | 0 | 0 | 0 |
| Wheel event to `scroll` event, median | 32 ms | 32 ms | 32 ms |
| Smooth scroll of 4,000 px | 1,040 ms | 210 ms | 204 ms |
| Size, brotli | 0 | 9.0 KB | + 0.9 KB |

What that means:

- Input reaches the screen as fast as native, and a frame costs about a tenth of a millisecond more.
- Mounting costs about 0.06 ms more per area. Most of it is the browser styling and laying out the bars; the
  engine's own setup is about 0.04 ms. An area makes bars only for the axes it scrolls.
- The smooth-scroll row is a choice, not a speed: Chrome takes a second for 4,000 px, the default `duration` is
  220 ms. Set `duration` to taste.
- The one real cost: native scrolling runs on the compositor, so it keeps moving while the main thread is busy.
  This runs on the main thread, so a long task stalls it as it stalls any animation in JavaScript. Keep long work
  off the main thread, or leave the page's own scrolling native (Warp's `ScrollRail`) and use this for panels.

## Troubleshooting

**The area doesn't scroll.** The root needs a height (or a parent that gives it one), and the stylesheet must be
loaded: without it the viewport isn't sized to the root.

**Nothing happens on touch screens.** Check for a `touch-action` set on an ancestor. Or pass `touch: 'native'` to
let the browser handle touch.

**The bar doesn't change colour with my theme.** Set the `--scroll-*` properties in your theme rather than passing
colours as options: options are written inline and win over CSS.

**A canvas bar keeps an old colour after a theme change.** Canvas colours are resolved once per options and colour
scheme. Call `refresh()`, or `update` with new `bar` options, when a theme changes them some other way.

**The page scrolls instead of the area.** The gesture started at the area's edge, so it went to the page, as
native scrolling does. `chain: 'contain'` keeps it in the area.

## Related packages

| Package | What it is |
|---|---|
| [`@weft-js/warp`](https://www.npmjs.com/package/@weft-js/warp) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp)</sup> | Warp's components; `ScrollView` is this package as a Weft component |
| [`@weft-js/warp-core`](https://www.npmjs.com/package/@weft-js/warp-core) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp-core)</sup> | Warp's behaviour without a framework, including the `virtualizer` for long lists |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/core)</sup> | The Weft runtime |
| [`@weft-js/create`](https://www.npmjs.com/package/@weft-js/create) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/create)</sup> | `npm create @weft-js` starts an app with Warp |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). In `packages/scroll`:

```bash
pnpm test             # unit tests, then Chromium and Firefox
WEFT_WEBKIT=1 pnpm test   # WebKit too
pnpm run bench        # against native scrolling
```

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
