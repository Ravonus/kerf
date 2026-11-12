# @kerf-js/capture

Drive a built kerf page in headless Chrome on the GPU: repeatable stills at scroll stops, frame times while it
scrolls, contact sheets, and the bake that renders a scene stage's posters from the scenes themselves. A dev
dependency only: nothing here goes into a page's bundle.

```bash
pnpm add -D @kerf-js/capture
```

It drives the Chrome installed on the machine (`--chrome <path>` for another), with ANGLE on Metal on macOS.

## From a terminal

`kerf capture <command>` (or `kerf-capture`). A target is a URL, or a built folder, which is served on 127.0.0.1
while the command runs; `--path /page.html` picks a page in it.

```bash
kerf capture stills dist --stops 0,hero@0.5,2@1 \
  --width 1440 --height 900 --dpr 2 --out shots --sheet
kerf capture frames dist --from pay@0 --seconds 5 \
  --speed 600 --cpu 4 --out frames.json
kerf capture sheet shots/*.png --out sheet.png --cols 4
kerf capture bake dist --out src/posters --format avif
```

A stop is pixels (`1200`), a section at a share of its pass (`hero@0.5`, `2@0`: by id or index), or pixels past a
section's top (`hero+300`). A section taller than the viewport passes from its top at the viewport's top to its
bottom at the viewport's bottom; a shorter one from entering below to leaving above. Sections are `section`
elements unless `sections` names another selector.

## From code

```js
import { capture, frames, launch } from '@kerf-js/capture'
import { open, sheet } from '@kerf-js/capture'

const browser = await launch()
const stops = [0, { section: 'hero', at: 0.5 }]
const { stills } = await capture({ url, browser, stops })
const tiles = stills.map((s) => s.png)
const png = await sheet(browser, tiles, { labels: ['top', 'hero'] })
const page = await open(browser, { url, dpr: 2 })
const run = await frames(page, { seconds: 5, cpu: 4 })
await browser.close()
```

`capture` waits at each stop until the page has settled: every `<Stage>` has drawn at that scroll offset (its
`data-stage-ready`), transitions have finished and the images in view have decoded. The stage's clock is frozen
first (`seconds`, default 0), so the same stop on the same GPU gives the same PNG and the same hash.

`frames` scrolls from `from` (a stop, default the top) and reports p5 fps, the median and p95 frame time, and
the frames over 33 and 50 ms, with the machine's load before and after. Headless Chrome caps frames at 60 Hz, so
read the slow end, not the median. Run one at a time on a quiet machine, and keep the load with the number.

## Baked posters

A `<Scene poster="bake" id="...">` gets a still of its own scene. The bake opens the built page at a wide size
(1440 × 900 at 1×) and a tall one (390 × 844 at 2×), has the stage draw each baked scene alone through its blend
with the clock stopped, at the scene's `hold` or else where its section fills the viewport, encodes it (AVIF quality 50 by default, or WebP) and writes
`<id>.<tier>.avif` and `posters.json`. The build then takes them in as assets:

```ts
// vite.config.ts
import { posters } from '@kerf-js/capture/vite'
export default { plugins: [posters({ dir: 'src/posters' })] }
```

```tsx
/// <reference types="@kerf-js/capture/posters" />
// registers the baked stills before anything renders
import 'virtual:kerf/posters'
```

Build, bake, build: the first build has no posters yet, and the second carries them. The stage shows the tall
still on a tall screen, and on its poster tier (`<Stage tier="auto">` on a phone) the stills are all there is.

## The page contract

Any page can be captured. A kerf scene stage adds two things: `data-stage-ready` on its root, the scroll offset
of the last settled frame (`poster` on the poster tier), and `root[Symbol.for('kerf.stage')]`, a `StageHandle`
from `@kerf-js/veneer/scenes` that lists the scenes, freezes the clock and draws stills.
