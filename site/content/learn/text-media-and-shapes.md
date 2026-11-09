# Text, media and shapes

:::learn
- How `<Text>` holds a place for text that hasn't arrived, and keeps streamed text from jumping
- How `<Media>` renders an image or video with its size, a placeholder and the right file for the screen
- How a skeleton can come from your own markup with `pending="shape"`
- How `<Surface>` puts a canvas or WebGL view in layout, with live props and real text
- Where fonts and text measuring come from (`@weft-js/text`), and what `@weft-js/core/head` is for
:::

Most of what a page shows is elements and text, and Weft's TSX covers it. A few things need more care than an element
can give on its own: text that isn't there yet, text that streams in a few characters at a time, images that should
arrive at the right size without pushing the page around, and drawing that only a canvas can do. Weft has a small
module for each, under `@weft-js/core`, and each one only costs a page that imports it.

They share one goal: **nothing moves**. Layout shift, content jumping as things load, is one of the most annoying
things a page can do, and these tools exist so that each part of the page takes its final size from the first paint.

| Import | For |
|---|---|
| `@weft-js/core/text` | `<Text>`: reserved and streamed text; `measure`, `lines`, `fit` |
| `@weft-js/core/media` | `<Media>` for images, video and audio from `?media` imports; `timeline()` |
| `@weft-js/core/shape` | What `<Boundary pending="shape">` compiles to: placeholders shaped like your data |
| `@weft-js/core/surface` | `defineSurface` and `<Surface>`: canvas and WebGL as layout children |
| `@weft-js/core/head` | The router's half of page metadata |
| `@weft-js/text` | The plugin for `weft.config.ts`: fonts, and the engine that measures text |

## `<Text>`: text that holds its place

Picture a quote that loads after the page: an empty paragraph, then a paragraph with two lines in it. Everything below
moves down when it arrives. `<Text reserve>` keeps the room while the text is missing:

:::demo escape-reserve

```tsx
import { state } from '@weft-js/core'
import { Text } from '@weft-js/core/text'
import { Button } from '@weft-js/warp'

export function Quote() {
  const quote = state('')
  const load = () => {
    quote.value = ''
    setTimeout(
      () =>
        (quote.value = 'Make it work, make it right, make it fast.'),
      900,
    )
  }
  return (
    <div>
      <Text reserve={60}>{quote.value}</Text>
      <Button onClick={load}>Load a quote</Button>
    </div>
  )
}
```

While the children are empty (`undefined`, `null`, `''` or `false`), `<Text>` renders placeholder text of about that many
characters, invisible, inside the real element. The browser lays it out with the real font, width and line height, so
the reserved room is exactly what text of that length would take, with nothing measured in JavaScript. The element is
marked `aria-busy`, and Warp's skeleton styles can show it as a shimmering bar (the demo imports
`@weft-js/warp/skeleton` for that).

`reserve` takes a number of characters, `true` for one line's worth, or a sample string. Pass `as` to choose the element:
`'p'` (the default), `'span'`, `'div'`, `'li'` or `'h1'` to `'h4'`.

:::note Text is the core one; Warp has another
Warp also exports a `Text`, for its type roles (`<Text role="caption">`). They're different components. If a file needs
both, rename one: `import { Text as Reserved } from '@weft-js/core/text'`.
:::

### Streamed text

An AI reply or a log arrives a few characters at a time. In a plain element, each new token can rewrap the last line,
the element's height changes many times a second, and in a scrolling container the lines above jump. Weft flags text
streamed straight into a scroll container (**X035**). `<Text stream>` is the fix:

:::demo escape-stream

```tsx
import { Text } from '@weft-js/core/text'

export function Answer(props: { text: string }) {
  return <Text stream>{props.text}</Text>
}
```

With `stream`, three things change:

- **Tokens land once a frame**, however fast they arrive, so the page does one layout per frame.
- **The height only grows, in whole lines.** The element never gets shorter mid-stream and never stops halfway through
  a line, so what's below it moves at most one line at a time.
- **Finished blocks never change.** The text is split at blank lines outside code fences; everything before the last
  break is done and stays as it is, and only the tail is rewritten.

Give `format` to render each finished block, as Markdown say: `<Text stream format={block => <Markdown text={block} />}>`.
The tail stays plain text until its block closes, so a half-written list or link never renders broken.

### Measuring text before it's rendered

Sometimes you need a text's size without rendering it: to size a virtual list's rows, to fit a headline in a box, or to
place a label. `@weft-js/core/text` has three reactive helpers for that:

```tsx
import { state } from '@weft-js/core'
import { fit, measure } from '@weft-js/core/text'

export function Headline() {
  const title = state('Fine-grained reactive TSX')
  const box = measure(() => title.value, {
    font: '600 24px Inter',
    lineHeight: 32,
    width: 320,
  })
  const size = fit(() => title.value, {
    font: s => `700 ${s}px Inter`,
    width: 320,
    maxLines: 2,
  })
  return (
    <p>
      {box.value
        ? `${box.value.lineCount} lines, ${box.value.height} px`
        : 'Measuring…'}
      , fits at {size.value ?? '?'} px
    </p>
  )
}
```

- `measure(text, spec)` is the height and line count the text takes at that width.
- `lines(text, spec)` is the text of each line and its width.
- `fit(text, spec)` is the largest whole font size that keeps the text within `maxLines` at that width.

Each takes values or getters and returns a value you read with `.value`, which is `null` until the measuring engine has
loaded. The engine is Pretext, Cheng Lou's line breaker, which computes line breaks with arithmetic rather than asking
the DOM. It comes from the `@weft-js/text` plugin, which loads it lazily, only on pages that measure. Without the plugin,
or with `measure: 'off'`, the values stay `null`, and `weft check` reports a page that needs the engine but has nothing
providing it (**P101**). Name a real font family in `font`: `system-ui` can resolve differently in canvas and CSS
(**X002**).

## `<Media>`: images and video that arrive at their size

An `<img>` without a width and height is 0 px tall until its file arrives, then pushes everything below it down. A
large photo sent to a phone wastes most of its bytes. `<Media>` and `?media` imports deal with both:

```tsx
import { Media } from '@weft-js/core/media'
import hero from '../../assets/hero.jpg?media'

export function Hero() {
  return (
    <Media
      src={hero}
      alt="A lighthouse at dusk, its beam crossing low cloud"
      priority
      width="1/2"
    />
  )
}
```

Importing a file with `?media` gives you a record the build made from it, not a URL: its intrinsic `width` and
`height`, the files to choose from, a tiny placeholder and its dominant colour. `<Media>` renders that as an
`<img>` (or a `<picture>` with efficient formats first) with:

- `width`, `height` and an `aspect-ratio`, so the box has its final size before a byte of the image arrives;
- the placeholder and dominant colour behind a photo until it paints;
- `srcset` and `sizes`, so the browser picks a file for the screen. `width` says how wide the image is drawn, as a
  fraction of the viewport (`"1/2"`) or a CSS length (`"240px"`);
- `loading="lazy"`, unless you mark the page's main image `priority`, which loads it eagerly and first.

`alt` is required. Describe what the image shows, or pass `alt=""` with `decorative` for images that carry no meaning.
`focus={[x, y]}` sets the focal point when the image is cropped with `fit="cover"`.

The resizing and encoding happen at build time. With `@weft-js/plugin-media` in your config, the build makes AVIF and
WebP files at several widths, choosing each image's quality by measuring it when it can; without the plugin, Weft reads
the size from the file's header and serves the original. Video and audio records come from
`@weft-js/plugin-media-ffmpeg`, which can also turn a large GIF into a video. The plugin also checks raw `<img>`
and `<video>` tags: a missing size (**M001**), a missing `alt` (**M007**), a hero that loads lazily (**M008**), and
more. [Uploads and media](/learn/uploads-and-media) covers media users upload, which takes a different path.

### Video and audio in step with code

A `?media` video or audio file plays through `<Media>` as well. To run code in step with it, make a `timeline`:

```tsx
import { Media, timeline } from '@weft-js/core/media'
import { Button } from '@weft-js/warp'
import clip from '../../assets/launch.mp4?media'

export function Launch() {
  const t = timeline(clip, { cues: { intro: 0, liftoff: 12 } })
  return (
    <div>
      <Media
        src={clip}
        timeline={t}
        alt="The rocket launch, from the countdown to orbit"
      />
      <p>
        {t.cue.value === 'liftoff'
          ? 'Liftoff!'
          : 'Counting down…'}{' '}
        {t.currentTime.value.toFixed(1)} s
      </p>
      <Button onClick={() => (t.playing.value = !t.playing.value)}>
        {t.playing.value ? 'Pause' : 'Play'}
      </Button>
    </div>
  )
}
```

`currentTime` and `playing` are boxes, and writing them is a command: set `currentTime` to seek, `playing` to play or
pause. `cue` is the last cue reached, `duration` and `ended` are read-only, and `t.on('liftoff', fn)` runs code when
playback crosses a cue (not when you seek past it).

## Shapes: skeletons from your own markup

A skeleton, grey bars where text will be, keeps a loading region the size of what's coming. The trouble is keeping a
hand-drawn skeleton the same size as the real content as both change. When the two differ, the swap moves the page, and
Weft warns in development (**X031**).

`<Boundary pending="shape">` hands that job to the compiler:

:::demo escape-shape

```tsx
import { Boundary, resource } from '@weft-js/core'
import '@weft-js/warp/skeleton'

type Post = { id: number; title: string; body: string }
declare function loadPosts(): Promise<Post[]>

function Feed() {
  const posts = resource(loadPosts)
  return (
    <ul>
      {(posts.value ?? []).map(p => (
        <li key={p.id}>
          <strong>{p.title}</strong> {p.body}
        </li>
      ))}
    </ul>
  )
}

export function Posts() {
  return (
    <Boundary pending="shape">
      <Feed />
    </Boundary>
  )
}
```

For each component that returns TSX, the compiler writes a *shape variant*: the same elements, with every piece of text
replaced by a placeholder bar and none of the behaviour. `pending="shape"` renders the variant of the Boundary's children
as the fallback. It's laid out by the browser like the real thing, so the swap moves nothing. It even takes its place,
hidden, from the very first paint, and is only revealed if the data takes longer than 150 ms.

Variants are only built into a page that uses one, so this costs nothing elsewhere. `@weft-js/core/shape` holds what the
compiled variants call; you don't import from it yourself. The CSS that draws the bars is Warp's: import
`@weft-js/warp/skeleton` once if the page has no other Warp skeleton on it.

How long is each bar? With a plain `resource`, Weft knows nothing about the data, so it draws a few rows of short bars.
With a `@weft-js/start` query, the bars come from the query's `output` schema: `z.string().max(80)` gives a bar of up to
80 characters, and `.max(20)` on an array or a `limit` input gives the row count. A list with no count hint shows five
rows and warns (**X032**); a string with no length hint warns too (**X036**). A query's resource also has `.shape`, the
placeholder value itself, for a hand-written fallback.

For a fallback you draw yourself, Warp's `<Shape>` gives you the standard skeletons by kind and count:
`<Shape kind="list" rows={5} />`, `kind="card"`, `kind="table"`, `kind="media"`.

## `<Surface>`: a canvas in layout

Charts, games, generative art and data-heavy views draw on a canvas. A raw `<canvas>` is awkward in a component: it has
no size until you give it one, it blurs on high-density screens unless you scale it, it doesn't redraw when your data
changes, and text drawn on it is invisible to screen readers and search. A surface handles all of that:

:::demo escape-surface

```tsx
import { state } from '@weft-js/core'
import { defineSurface, Surface } from '@weft-js/core/surface'
import { Slider } from '@weft-js/warp'

const Bars = defineSurface<{ data: number[] }, 'canvas2d'>({
  name: 'bars',
  kind: 'canvas2d',
  setup(s, props) {
    s.draw(() => {
      const { height } = s.size.value
      s.ctx.fillStyle = s.tokens.accent?.css ?? 'currentColor'
      props.data.forEach((v, i) =>
        s.ctx.fillRect(i * 24, height - v, 20, v),
      )
    })
  },
})

export function Sales() {
  const boost = state(0)
  return (
    <div>
      <Slider
        label="Boost"
        min={0}
        max={50}
        value={boost.value}
        onChange={v => (boost.value = v)}
      />
      <Surface
        use={Bars}
        data={[30, 70, 50, 90].map(v => v + boost.value)}
        aspect="3/1"
        label="Sales by quarter"
      />
    </div>
  )
}
```

- **`defineSurface`** declares one: a `name`, a `kind` (`canvas2d` or `webgl2`), and a `setup` that runs once, in the
  browser, when the surface mounts. Return a function from `setup` to clean up.
- **`<Surface use={…}>`** places it. Its other props are the surface's own, and they're live: `setup` reads them from
  `props`, so never destructure them. `aspect` sizes it (default `2/1`), and the server renders an empty box of that
  size, so nothing shifts when the canvas arrives.
- **`s.draw(fn)`** paints whenever a box `fn` read changes, on the next frame, after clearing the canvas.
  **`s.frame(fn)`** paints on every tick of a shared clock, for animation. Neither re-renders anything around the
  canvas: moving the slider above repaints the bars and nothing else.
- **`s.size`**, **`s.dpr`** and **`s.tokens`** are live too: the canvas is sized for the screen's pixel density, and
  `s.tokens.accent` is your theme's accent colour, so switching to dark mode repaints in the new colour.

A surface needs a `label`, or `decorative` if it shows nothing a reader needs (**X009**). The shared `clock` from
`@weft-js/core/surface` pauses, plays and seeks every animated surface at once, and starts paused for users who prefer
reduced motion.

### Text on a surface

Text drawn with `fillText` exists only as pixels: no selection, no find in page, no translation, no screen reader. Weft
reports it (**X010**). `s.text(text, options)` draws the text and keeps a real element over it, placed exactly where the
pixels are, so all of those work:

<!-- example: skip needs the text() plugin in weft.config.ts (P101), which the example app doesn't have -->
```tsx
import { defineSurface } from '@weft-js/core/surface'

export const Score = defineSurface<{ points: number }, 'canvas2d'>({
  name: 'score',
  kind: 'canvas2d',
  setup(s, props) {
    s.text(() => `Score ${props.points}`, {
      x: 8,
      y: 8,
      width: 200,
      font: '600 16px Inter',
      lineHeight: 22,
    })
  },
})
```

On a canvas, `s.text` lays out lines with the same measuring engine as `measure`, so it needs the `@weft-js/text`
plugin (P101 without it). For text that is pure decoration, wrap the call: `s.decorative(() => s.ctx.fillText(…))`.
[Reference: surface](/reference/surface) has the full list of options, WebGL, pixel-art targets and testing.

## Fonts: `@weft-js/text`

The measuring engine and the `s.text` mirror both depend on knowing the font. `@weft-js/text` is where an app declares
its fonts, in `weft.config.ts`:

```ts
import { defineConfig } from '@weft-js/core/config'
import { text } from '@weft-js/text'

export default defineConfig({
  plugins: [
    text({
      fonts: {
        body: {
          family: 'Inter',
          src: 'assets/fonts/inter.woff2',
          fallback: 'Arial',
          axes: { wght: [100, 900] },
        },
      },
      measure: 'auto',
    }),
  ],
})
```

The build subsets each font, writes the `@font-face` rules and preload links, and adds a fallback face matched to the
font's metrics, so text doesn't shift when the real font arrives. `measure: 'auto'` makes the engine available to
pages that measure; `'off'` leaves it out. [Fonts](/learn/fonts) covers the font side in full.

## `@weft-js/core/head`

`@weft-js/core/head` exports `setHead`, which the `@weft-js/start` router calls after a client-side navigation to
replace the page's title and meta tags with the next route's. You don't call it yourself: a route declares its
metadata, and the server writes it into the HTML for crawlers while the router keeps the tab's title in step. See
[Metadata and share images](/learn/metadata-and-share-images).

## Recap

- `<Text reserve>` holds a text's room while it's missing, with invisible placeholder text the browser lays out.
- `<Text stream>` lands tokens once a frame, grows in whole lines and never rewrites a finished block (X035).
- `measure`, `lines` and `fit` size text before it renders, with the engine from `@weft-js/text` (P101 without it).
- `?media` imports and `<Media>` give images and video their size, a placeholder and the right file; `timeline()`
  syncs code to playback.
- `<Boundary pending="shape">` makes the skeleton from your own markup, so the swap moves nothing (X031, X032, X036).
- `defineSurface` and `<Surface>` put canvas and WebGL in layout with live props; `s.text` keeps text real (X009,
  X010).
- `@weft-js/text` declares fonts and provides the measuring engine; `@weft-js/core/head` is the router's.

## Try it

:::challenge Reserve the right amount
A product card shows a description that loads separately. Descriptions are one to two sentences, around 120
characters. Make the card keep that room while it waits, so the price below doesn't jump.

```tsx
import { resource } from '@weft-js/core'

declare function loadDescription(id: string): Promise<string>

export function Product(props: { id: string; price: string }) {
  const description = resource(() => loadDescription(props.id))
  return (
    <article>
      <p>{description.value}</p>
      <p>{props.price}</p>
    </article>
  )
}
```
:::solution
Render the description with `<Text reserve={120}>`. While `description.value` is `undefined`, it holds about 120
characters of room at the card's width and font:

```tsx
import { resource } from '@weft-js/core'
import { Text } from '@weft-js/core/text'

declare function loadDescription(id: string): Promise<string>

export function Product(props: { id: string; price: string }) {
  const description = resource(() => loadDescription(props.id))
  return (
    <article>
      <Text reserve={120}>{description.value}</Text>
      <p>{props.price}</p>
    </article>
  )
}
```

A `<Boundary pending="shape">` around the card would work too, and suits a region with several loading parts.
:::

:::challenge A progress ring on a surface
Draw a ring that fills to a `progress` prop between 0 and 1, in the theme's accent colour, and say the percentage to
screen readers. Show it with a slider that sets the progress.
:::solution
`s.draw` repaints when `props.progress` changes, because it reads it. The `label` gives the canvas its accessible name,
and it's live, so it follows the slider.

```tsx
import { state } from '@weft-js/core'
import { defineSurface, Surface } from '@weft-js/core/surface'
import { Slider } from '@weft-js/warp'

const Ring = defineSurface<{ progress: number }, 'canvas2d'>({
  name: 'ring',
  kind: 'canvas2d',
  setup(s, props) {
    s.draw(() => {
      const { width, height } = s.size.value
      const r = Math.min(width, height) / 2 - 8
      s.ctx.lineWidth = 8
      s.ctx.strokeStyle = s.tokens.accent?.css ?? 'currentColor'
      s.ctx.beginPath()
      s.ctx.arc(
        width / 2,
        height / 2,
        r,
        -Math.PI / 2,
        -Math.PI / 2 + props.progress * Math.PI * 2,
      )
      s.ctx.stroke()
    })
  },
})

export function Upload() {
  const percent = state(40)
  return (
    <div>
      <Slider
        label="Progress"
        min={0}
        max={100}
        value={percent.value}
        onChange={v => (percent.value = v)}
      />
      <Surface
        use={Ring}
        progress={percent.value / 100}
        aspect="1/1"
        style="max-inline-size:8rem"
        label={`${percent.value}% uploaded`}
      />
    </div>
  )
}
```
:::

:::challenge Keep the chat from jumping
This chat appends a streamed reply into a scrolling box, and the lines above shake as it arrives. Fix it.

```tsx
export function Reply(props: { text: string }) {
  return (
    <div
      style={'max-block-size:20rem;overflow:auto;' +
        'white-space:pre-wrap'}
    >
      {props.text}
    </div>
  )
}
```
:::solution
Render the streamed text with `<Text stream>` inside the scroller. Its height only grows, a whole line at a time, and
finished paragraphs are never rewritten:

```tsx
import { Text } from '@weft-js/core/text'

export function Reply(props: { text: string }) {
  return (
    <div style="max-block-size:20rem;overflow:auto">
      <Text stream>{props.text}</Text>
    </div>
  )
}
```

This is the fix **X035** suggests.
:::
