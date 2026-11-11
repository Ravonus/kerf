# Surfaces (`@kerf/core/surface`)

A canvas or WebGL view that sits in layout like any other child. `setup` runs once on the client, props are live, and
nothing around it re-renders. Never write a raw `<canvas>`.

```tsx
import { state } from '@kerf/core'
import { defineSurface, Surface } from '@kerf/core/surface'
import { z } from 'zod'

export const Bars = defineSurface({
  name: 'bars',
  kind: 'canvas2d',                                // or 'webgl2'
  // Or defineSurface<{ data: number[] }, 'canvas2d'>({ ... })
  props: z.object({ data: z.array(z.number()) }),
  // Runs once; props.data is live, so never destructure it.
  setup(s, props) {
    // Repaints on box changes; the canvas is cleared first.
    s.draw(() => {
      const { width, height } = s.size.value // CSS px, live
      // Live theme colours: .css, or .linear for shaders.
      s.ctx.fillStyle = s.tokens.accent.css
      props.data.forEach((v, i) => {
        s.ctx.fillRect(i * 12, height - v, 10, v)
      })
    })
  },
})

export function Page() {
  const rows = state([3, 7, 5])
  return (
    <Surface
      use={Bars}
      data={rows.value}
      aspect="16/9"
      label="Sales by month"
    />
  )
}
```

A control beside the surface needs only a box and a live prop. Nothing re-renders when it moves:

```tsx
import { state } from '@kerf/core'
import { defineSurface, Surface } from '@kerf/core/surface'

// Name the kind too, so s.ctx is typed.
export const Stars = defineSurface<{ density: number }, 'canvas2d'>({
  name: 'stars',
  kind: 'canvas2d',
  setup(s, props) {
    // Every tick; reading props.density here keeps it live.
    s.frame(({ seconds }) => {
      for (let i = 0; i < props.density; i++) {
        const { width, height } = s.size.value
        const x = (i * 37 + seconds * 20) % width
        const y = (i * 91) % height
        s.ctx.fillRect(x, y, 1, 1)
      }
    })
  },
})

export function Sky() {
  const density = state(100)
  const setDensity = (e: Event & {
    currentTarget: HTMLInputElement
  }) => (density.value = e.currentTarget.valueAsNumber)
  return <>
    <input
      type="range"
      min="10"
      max="500"
      value={density.value}
      onInput={setDensity}
      aria-label="Density"
    />
    <Surface
      use={Stars}
      density={density.value}
      aspect="16/9"
      decorative
    />
  </>
}
```

**`<Surface>`:** `use`, your props, `aspect` (default `2/1`), `label` (required, X009) or `decorative`, `class`, `style`.
The server renders a sized placeholder, so nothing shifts when the canvas mounts. Put pointer handlers on `s.el`.

**`s`:**
- `s.ctx` (`canvas2d`), `s.gl` (`webgl2`), `s.canvas`, `s.el`
- `s.size`, `s.dpr`, `s.scale`: boxes. `canvas2d` draws in CSS px; `webgl2` has its viewport set for you
- `s.tokens.accent`: `--accent`, else `--veneer-accent`, as `{ css, linear }`
- `s.draw(fn)`: paint when a box it read changes
- `s.frame(t => ...)`: animate: `t.frame`, `t.seconds`, `t.delta`. Also repaints on a box change while paused
- `s.invalidate()`: book a paint by hand
- `s.text(text, options)`: text; see below
- `return () => ...` from `setup` to clean up

`defineSurface` also takes `fps` (default 60), `maxDpr` (default 2), `clear: false`, `context` (`getContext` attributes),
and `pixel: { width, height }` for a fixed target with integer scale and nearest sampling.

**The clock** is shared: `import { clock } from '@kerf/core/surface'`, then `clock.pause()`, `clock.play()`, `clock.seek(seconds)`.
`seek` paints every animated surface now, so a capture is deterministic. Under `prefers-reduced-motion: reduce` it
starts paused on the first frame. Off-screen surfaces skip their paints.

## Text

Never `fillText` (X010). `s.text()` keeps a real element over the text, so selection, find, translation, screen readers,
forced colours and print all work:

```tsx
const score = s.text(() => `Score ${props.score}`, {
  x: 8, y: 8, width: 200,
  font: '600 16px Inter', lineHeight: 22,
})
```

- Options may be a function, for live positions: `() => ({ x: s.size.value.width / 2, ... })`.
- `font` and `lineHeight` default to the CSS on the mirror. `color` defaults to the surface's. `align` is `left`,
  `center` or `right`. Name a family (X002).
- It returns `{ el, lineCount, height }`; the last two are boxes.
- Canvas `s.text()` needs the `text.measure` slot, so add `text()` from `@kerf/text` to `plugins` in
  kerf.config.ts (P101). Its engine loads lazily. On `webgl2` the mirror is the visible text, and no plugin is needed.
- `s.decorative(() => ctx.fillText(...))` is for text that is truly decoration.

## Testing

jsdom has no canvas, so `@kerf/core/test` gives it a recording one:

<!-- example: skip imports the Page above from its own file -->
```tsx
import {
  canvasCalls,
  clock,
  fakeMeasure,
  flush,
  render,
} from '@kerf/core/test'
import { expect, test } from 'vitest'
import { Page } from './Page'   // the Bars page above

test('draws a bar per value', async () => {
  clock.install()
  render(Page, {}, { slots: { 'text.measure': fakeMeasure() } })
  await flush()
  await clock.advance(16)   // a frame
  const canvas = document.querySelector('canvas')!
  const bars = canvasCalls(canvas).filter(c => c.name === 'fillRect')
  expect(bars).toHaveLength(3)
})
```

`kerf surfaces --json` (MCP `surfaces`) lists what the project already has.
