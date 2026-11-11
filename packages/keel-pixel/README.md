<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">@kerf-js/keel-pixel</h1>

<p align="center">
  <strong>KEEL's WebGL2 pixel renderer as a Kerf surface kind: <code>kind: 'keel-pixel'</code>.</strong><br>
  A fixed low-resolution target scaled up with nearest sampling, plus KEEL's seeded theme recipes as palettes and CSS variables.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kerf-js/keel-pixel"><img src="https://img.shields.io/npm/v/@kerf-js/keel-pixel?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/kerf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/kerf/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/kerf/quality.yml?branch=main&label=checks" alt="checks"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/kerf">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md) before you upgrade.

Kerf's surfaces (`@kerf-js/core/surface`) are canvas or WebGL views that sit in layout like any other child: `setup`
runs once on the client, props stay live, and nothing around them re-renders. Core has two built-in kinds, `canvas2d`
and `webgl2`. This plugin adds a third, `keel-pixel`, through the `surface.renderer@1` slot. A `keel-pixel` surface gets
`s.px`, KEEL's `PixelRenderer`, which owns the GL context and draws a palette-indexed 3D world into a small fixed
target. It also exports KEEL's theme recipes, which turn a seed into palette ramps and `--keel-*` CSS variables.

The renderer and theme code are vendored from KEEL's engine (keel-engine) at a pinned commit; see
[Vendored code](#vendored-code).

## Highlights

- **A new surface kind, nothing else to wire.** `keelPixel()` in `plugins` registers `keel-pixel`; `defineSurface({ kind:
  'keel-pixel', pixel: { width, height } })` uses it.
- **Loaded only where it's used.** The renderer sits behind the slot's `import()`, so only pages that mount a
  `keel-pixel` surface download it.
- **Fixed pixel target.** `pixel: { width, height }` renders at that resolution and scales up by an integer with nearest
  sampling.
- **Seeded themes.** `recipeTheme({ seed, culture })` gives the same theme every time for the same recipe: palette ramps,
  frame, type, spacing and motion. `themeTokens(theme, scale)` turns it into CSS variables.
- **KEEL's UI styles.** `@kerf-js/keel-pixel/styles.css` styles `[data-keel-theme]`, `.keel-panel` and
  `.keel-button` from those variables, and drops animation under `prefers-reduced-motion`.
- **Typed `s.px`.** The package augments `@kerf-js/core/surface`'s `SurfaceKinds`, so `s.px` is typed inside `setup`.
- **Clean teardown.** When the surface goes, the WebGL context is released with `WEBGL_lose_context`.

## Install

```bash
# npm
npm install @kerf-js/keel-pixel

# pnpm
pnpm add @kerf-js/keel-pixel

# bun
bun add @kerf-js/keel-pixel
```

Or let the `kerf` CLI install it and add it to `kerf.config.ts` in one step:

```bash
npx kerf add surface-keel
```

The
package has no `/plugin` entry and no default export, so `kerf add` writes `import { keelPixel } from
'@kerf-js/keel-pixel'` and adds `keelPixel()` to `plugins`.

**What it needs:** a browser with WebGL2. There's no server or build-time dependency. If you draw canvas text with
`s.text()` on a surface, add `text()` from `@kerf-js/text` too (the `text.measure` slot), as the demo does.

## Quick start

```ts
// kerf.config.ts
import { defineConfig } from '@kerf-js/core/config'
import { text } from '@kerf-js/text'
import { keelPixel } from '@kerf-js/keel-pixel'

export default defineConfig({ plugins: [text(), keelPixel()] })
```

```tsx
// src/routes/scene.tsx
import { defineSurface, Surface } from '@kerf-js/core/surface'
import {
  recipeTheme,
  themeTokens,
} from '@kerf-js/keel-pixel/theme'
import '@kerf-js/keel-pixel/styles.css'

const theme = recipeTheme({
  seed: 'keel/react-demo',
  culture: 'clean',
})
const css = Object.entries(themeTokens(theme, 2))
  .map(([k, v]) => `${k}:${v}`)
  .join(';')

// Palette ramps are packed RGB numbers; the renderer takes [r, g, b]
// triples and named ranges.
const colours = [
  ...theme.palette.surface,
  ...theme.palette.accent,
].map((c: number) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255])
const ramps = {
  surface: [0, theme.palette.surface.length],
  accent: [theme.palette.surface.length, theme.palette.accent.length],
}

export const Scene = defineSurface({
  name: 'keel-scene',
  kind: 'keel-pixel',
  pixel: { width: 256, height: 144 },
  fps: 30,
  setup(s) {
    s.px.setPalette(colours, ramps)
    s.px.setMaterials([{ ramp: 'surface' }, { ramp: 'accent' }])
    s.px.setWorld({
      boxes: [
        { c: [0, -0.5, 0], h: [5, 0.5, 5], mat: 0 },
        { c: [0, 1, 0], h: [0.75, 1, 0.75], mat: 1 },
      ],
    })
    s.px.setStyle({ screen: 4 })
    s.frame((t) =>
      s.px.render({
        eye: [Math.sin(t.seconds) * 5, 3, Math.cos(t.seconds) * 5],
        target: [0, 1, 0],
        time: t.seconds,
      }),
    )
  },
})

export default function Page() {
  return (
    <div
      data-keel-theme={theme.key}
      style={css}
    >
      <Surface
        use={Scene}
        label="A box on a floor, orbited by the camera"
        style="max-width:640px"
      />
    </div>
  )
}
```

This is the package's own demo (`demo/KeelDemo.tsx`, a port of keel-engine's React scaffold demo), trimmed. The camera
orbits on the shared surface clock, so `clock.pause()` from `@kerf-js/core/surface` stops it, and under
`prefers-reduced-motion: reduce` it starts paused.

## How it plugs into Kerf

| Piece | Detail |
| --- | --- |
| Slot | `surface.renderer@1`, keyed, client side only. This plugin provides the key `keel-pixel`. |
| Provider | `renderer` from `@kerf-js/keel-pixel/runtime`. Its `context(canvas, def)` creates the `PixelRenderer` and returns `{ fields: { px }, dispose }`. |
| Loading | Core's surface mount handles `canvas2d` and `webgl2` itself; any other kind is loaded through `import('kerf:slot/surface.renderer')`. If loading fails, the error is logged and the host element gets `data-surface-error="keel-pixel"`. |
| Namespace | `surface-keel/`. |
| Agent notes | `kind: 'keel-pixel'` needs `pixel: { width, height }`; `s.px` is KEEL's `PixelRenderer`; palettes come from `recipeTheme()`. |

Everything else about a surface is core's: `<Surface>` takes `use`, your props, `aspect` (default `2/1`), `label`
(required) or `decorative`, `class` and `style`, and the server renders a sized placeholder so nothing shifts when the
canvas mounts. `kerf docs surface` covers it.

## `defineSurface` with `kind: 'keel-pixel'`

| Field | Type | Default | What it does |
| --- | --- | --- | --- |
| `kind` | `'keel-pixel'` | | Selects this renderer. |
| `pixel` | `{ width: number, height: number }` | required | The fixed render target. Without it, mounting throws ``surface `<name>`: `keel-pixel` needs `pixel: { width, height }` ``. |
| `fps` | `number` | `60` | Core's frame cap for `s.frame`. |
| `setup(s, props)` | function | | Runs once on the client. `s.px` is the renderer; `s.frame`, `s.draw`, `s.size`, `s.el` and `s.text` work as for any surface. |

### `s.px`: the renderer

The typed part of KEEL's `PixelRenderer` (`src/vendor-types.d.ts`). The rest of the vendored API is reachable but
untyped.

| Method | What it takes |
| --- | --- |
| `setPalette(colours, ramps)` | `colours`: `[r, g, b]` triples. `ramps`: named `[start, length]` ranges into `colours`. |
| `setMaterials(materials)` | `{ ramp: string }[]`: material `i` shades from the named ramp. |
| `setWorld(world)` | The scene, for example `{ boxes: [{ c, h, mat }] }` (centre, half-extents, material index). |
| `setStyle(style)` | Render style, for example `{ screen: 4 }`. |
| `render(view)` | One frame: `{ eye, target, time }`. Call it from `s.frame`. |

## Themes

```ts
import {
  recipeTheme,
  themeTokens,
} from '@kerf-js/keel-pixel/theme'
```

| Function | Signature | What it returns |
| --- | --- | --- |
| `recipeTheme(recipe?)` | `{ seed?, culture?, pins? }` | A theme: `key`, `palette`, and frame, type, spacing and motion. The same recipe gives the same theme. |
| `themeTokens(theme, scale?)` | theme, integer scale | `--keel-*` CSS variables at that scale; at scale 2, `--keel-px` is `2px`. |

`palette` (type `Palette`) has `tone`, ramps `surface`, `ink`, `accent`, `good`, `warn`, `bad` (packed RGB numbers),
`team`, `outline`, `onAccent`, and `hues: { surface, accent }`.

`styles.css` reads `--keel-font`, `--keel-body`, `--keel-ink`, `--keel-surface`, `--keel-border`, `--keel-outline`,
`--keel-pad`, `--keel-on-accent`, `--keel-accent` and `--keel-px`, and sets `image-rendering: pixelated` on canvases inside
`.keel-canvas`.

## API reference

| Export | Entry | What it is |
| --- | --- | --- |
| `keelPixel()` | `@kerf-js/keel-pixel` | The plugin for `kerf.config.ts`. |
| `recipeTheme`, `themeTokens` | `@kerf-js/keel-pixel/theme` | KEEL's theme recipes (types come from the main entry's declarations). |
| `renderer` | `@kerf-js/keel-pixel/runtime` | The `surface.renderer@1` provider. Loaded by the slot; you don't import it yourself. |
| `styles.css` | `@kerf-js/keel-pixel/styles.css` | KEEL's UI styles, driven by the theme's CSS variables. |
| `SurfaceKinds['keel-pixel']` | type augmentation of `@kerf-js/core/surface` | Makes `s.px` a `PixelRenderer` in `setup`. |

## Recipes

**A play/pause button beside the scene.** The clock is shared, and `clock.playing` is a box the button reads:

```tsx
import { clock } from '@kerf-js/core/surface'

export function Controls() {
  return (
    <section
      class="keel-panel"
      aria-label="Scene controls"
    >
      <button
        class="keel-button"
        type="button"
        onClick={() =>
          clock.playing.value ? clock.pause() : clock.play()
        }
      >
        {clock.playing.value ? 'PAUSE' : 'PLAY'}
      </button>
    </section>
  )
}
```

**A deterministic frame for a screenshot.** `clock.seek(seconds)` paints every animated surface at that time.

## Limits

- Client only, and WebGL2 only. The server renders the sized placeholder.
- `pixel` is required: there is no resolution-following mode for this kind.
- Only the five `PixelRenderer` methods above are typed.
- The vendored engine is a snapshot. New KEEL features arrive only when the vendor files are regenerated from a newer
  pin.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| The surface stays a placeholder and has `data-surface-error="keel-pixel"` | The renderer failed to load or set up; the browser console has the error. Check that `keelPixel()` is in `plugins`, and that the browser has WebGL2. |
| ``surface `<name>`: `keel-pixel` needs `pixel: { width, height }` `` | Add `pixel` to the definition. |
| P101 for `text.measure` | `s.text()` on a canvas surface needs `text()` from `@kerf-js/text` in `plugins`. |
| Blurry pixels | Put the canvas inside `.keel-canvas` and import `styles.css`, or set `image-rendering: pixelated` yourself. |

## Vendored code

`vendor/` is generated by `scripts/vendor.mjs` from keel-engine commit `4bcccc7` and must not be edited by hand:

| File | From keel-engine |
| --- | --- |
| `keel-render.mjs` (and `keel-render/`) | `createPixelRenderer` from `packages/render` |
| `keel-theme.mjs` (and `keel-theme/`) | `recipeTheme` and `themeTokens` from `packages/react/src/design.ts` |
| `keel-styles.css` | `packages/react/src/styles.css` |

The checked patches in `scripts/vendor/` move the pinned bundles into local modules. `pnpm --filter
@kerf-js/keel-pixel vendor` regenerates them from a keel-engine checkout: `~/dev/keel-engine`, or a path
passed as its argument. It refuses a source without the pinned commit. The test that regenerates them reads
`KEEL_ENGINE`, and skips without a checkout.

## Related packages

| Package | What it is |
| --- | --- |
| [`@kerf-js/core`](https://www.npmjs.com/package/@kerf-js/core) | `defineSurface`, `<Surface>` and the clock (`@kerf-js/core/surface`). |
| [`@kerf-js/text`](https://www.npmjs.com/package/@kerf-js/text) | The `text.measure` slot that `s.text()` on a canvas needs. |
| [`@kerf-js/cli`](https://www.npmjs.com/package/@kerf-js/cli) | `kerf add surface-keel`, `kerf docs surface`, `kerf surfaces --json`. |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/kerf/blob/main/CONTRIBUTING.md). From the repository root:

```bash
# Plugin contract, themes, vendor checks
pnpm --filter @kerf-js/keel-pixel test
# Builds demo/ and checks pixels in Chrome and WebKit
pnpm --filter @kerf-js/keel-pixel test:e2e
```

The end-to-end run builds `demo/` with `@kerf-js/core/vite` and needs `@kerf-js/text` built first.

## License

[MIT](https://github.com/Ravonus/kerf/blob/main/LICENSE). The vendored KEEL code is MIT too; its licence is kept
byte-for-byte in [`vendor/LICENSE`](https://github.com/Ravonus/kerf/blob/main/packages/keel-pixel/vendor/LICENSE).
