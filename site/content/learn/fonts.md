# Fonts

:::learn
- How to declare an app's fonts with the `text()` plugin from `@weft-js/text`
- What the build does with them: subsets, preloads, and fallbacks matched to each font's metrics
- How to use a face in CSS and in warp's tokens
- How variable fonts and their axes are trimmed, and how to keep an axis
- What the X-codes about fonts catch
:::

A web font is the most common reason a page's text jumps after it loads. The browser draws the text in a fallback face,
the real font arrives, and every line reflows because the two faces have different widths. It's also often the biggest
thing the largest paint on a text-heavy page waits for.

weft handles fonts in one place: you list the faces in `weft.config.ts`, and the build does the rest. There's nothing to
import in your components and no `<link>` to write.

## Declaring fonts

`weft add text` installs `@weft-js/text` and adds `text()` to the config. Then list your faces under `fonts`:

```ts
import { defineConfig } from '@weft-js/core/config'
import { text } from '@weft-js/text'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({
  plugins: [
    warp(),
    text({
      fonts: {
        body: {
          family: 'Inter',
          src: 'assets/fonts/inter.woff2',
          fallback: 'Arial',
          axes: { wght: [100, 900] },
        },
        display: {
          family: 'Fraunces',
          src: 'assets/fonts/fraunces.woff2',
          fallback: 'Georgia',
          weight: 700,
        },
      },
    }),
  ],
})
```

Each key is a role of your choosing; `body` and `display` are the usual two. Each face takes:

- **`family`**: the name you'll use in CSS.
- **`src`**: the font file, relative to the project root: woff2, woff, ttf or otf. A file from a package works too, like
  `node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2`.
- **`fallback`**: the system face to stand in while it loads: Arial, Helvetica, Times New Roman, Georgia, Courier New or
  Verdana. Pick the one closest in shape: a sans for a sans, a serif for a serif.
- **`weight`** and **`style`** for a static face, or **`axes`** for a variable one: `{ wght: [100, 900] }` is the weight
  range it covers.
- **`display`**: `swap` (the default), `optional` or `fallback`.
- **`preload`**: whether the first paint waits for it. `body` and `display` are preloaded unless you say `false`; other
  roles only with `true`.

Beside `fonts`, `text()` takes `subsets` (default `['latin']`; also `latin-ext`, `cyrillic`, `greek`, `vietnamese` and
their extended sets) and `trim` (default `true`, below). The [Fonts reference](/reference/fonts) has every option.

:::note weft isn't on npm yet
`@weft-js/text` isn't published on its own yet. `weft add text` works in an app made from a weft checkout, which is how
apps are made today ([Installation](/learn/installation)).
:::

## What the build does

From that config, the build:

1. **Subsets each face** by `unicode-range` into hashed woff2 files, so a page loads the characters it can show and no
   more.
2. **Writes the `@font-face` rules**, plus a second face called `"<Family> Fallback"`: your fallback system font,
   scaled to the real font's widths and vertical metrics with `size-adjust` and the `ascent`, `descent` and `line-gap`
   overrides.
3. **Adds the preload links** to every page's head, before the first byte of the body.
4. **Trims each face**, in a production build only (below).

Step 2 is the one that stops the jump. While Inter loads, the page lays out in "Inter Fallback", which is Arial stretched
to Inter's measurements. When Inter arrives, each line already has the right width and height, so swapping it in moves
nothing.

:::deepdive What "metric matching" means
Every font has an advance width for each character, an ascent above the baseline, a descent below it and a line gap. Two
fonts at the same `font-size` can differ in all four, so a paragraph in Arial wraps differently from the same paragraph
in Inter. CSS lets a `@font-face` correct a local font: `size-adjust` scales its widths, and `ascent-override`,
`descent-override` and `line-gap-override` replace its vertical metrics. The build reads the real font file, computes the
four numbers that make Arial occupy Inter's space, and writes them on the fallback face. The result isn't the same
*look*, but it is the same *layout*, which is what keeps the page from moving. warp's own stylesheet does the same for
the faces it names.
:::

## Using a face

The build declares faces; it doesn't apply them. Name a face in your CSS, with its fallback face second:

```css
/* src/app.css */
body { font-family: "Inter", "Inter Fallback", sans-serif; }
h1 { font-family: "Fraunces", "Fraunces Fallback", Georgia, serif; }
```

Leave out `"Inter Fallback"` and the browser falls back to plain `sans-serif` while Inter loads, unscaled, and the
layout shifts when it arrives.

### With warp

warp's type roles read three tokens: `--warp-font-sans` for body text, `--warp-font-display` for headings and titles,
and `--warp-font-mono` for code. Point them at your faces with `fonts` in `warp()`. Pass a full stack, with the fallback
face, so warp's text gets the metric match too:

```ts
import { defineConfig } from '@weft-js/core/config'
import { text } from '@weft-js/text'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({
  plugins: [
    warp({
      fonts: {
        body:
          '"Inter", "Inter Fallback", ui-sans-serif, sans-serif',
        display:
          '"Fraunces", "Fraunces Fallback", Georgia, serif',
      },
    }),
    text({
      fonts: {
        body: {
          family: 'Inter',
          src: 'assets/fonts/inter.woff2',
          fallback: 'Arial',
          axes: { wght: [100, 900] },
        },
        display: {
          family: 'Fraunces',
          src: 'assets/fonts/fraunces.woff2',
          fallback: 'Georgia',
          weight: 700,
        },
      },
    }),
  ],
})
```

A bare family name, like `fonts: { body: 'Inter' }`, also works; warp then adds a system stack after it, without the
fallback face.

Each expression names its own faces: `balanced` uses Inter with Space Grotesk for headings, `quiet` Inter throughout, and
`vivid` Space Grotesk with Instrument Serif. warp names them but doesn't ship the files. Declare the ones your app shows
with `text()`, as this site does with the `@fontsource` packages, or override the tokens as above.

## Preloading

A preloaded face starts downloading with the page, before the CSS that uses it is parsed. That's right for the face of
your body text and your hero heading, and wrong for everything else: each preload competes with the page's own
bytes. The defaults (preload `body` and `display`) suit most apps. A face used only below the fold, or only in a code
block, should stay `preload: false`.

A custom server can read the list the build made:

```ts
import { preloads } from 'weft:fonts/preloads'

export const fontLinks = preloads.map((p) =>
  `<link rel="preload" as="font" type="${p.type}" ` +
  `href="${p.href}" crossorigin>`
).join('')
```

`@weft-js/core/vite` already loads the generated CSS and adds these links for you, in a Start app or an HTML one, so
most apps never touch this.

## Trimming: axes and characters

In a production build, `text()` makes each face smaller without changing how the page looks or which characters it can
show:

- **Axes.** A custom axis of a variable font (`SOFT`, `WONK`, `GRAD` …) is pinned to the one value your CSS's
  `font-variation-settings` gives it, or to the font's default if you never set it. An axis your source sets to two
  values stays. `wght`, `wdth`, `opsz`, `slnt` and `ital` are never pinned, because CSS drives them through
  `font-weight` and the like.
- **Characters.** `latin` is split in two. The core (ASCII, common punctuation, and every other latin character in your
  source) is preloaded. The rest is fetched through `unicode-range` only by a page that shows one of those characters,
  so text from a database still gets the right face after a matched swap.

`weft dev` always serves whole faces, so an axis you're adjusting responds while you work.

:::pitfall An axis set where the build can't see it
The build reads only your own source. A `font-variation-settings` value it can find but not read (a `var()`, a template
string, an expression from state) is the safe case: it keeps every axis. The trap is a value it never sees at all, such
as one in a dependency's CSS. Then the axis looks unused, it's pinned to its default, and the dependency's setting does
nothing in production. Keep the axis by naming it: `axes: { SOFT: [0, 100] }`. `trim: false` turns all trimming off.
:::

## The X-codes for fonts

`weft check` reads your CSS and the font build:

| Code | Catches |
|---|---|
| X020 | A hand-written `@font-face` for a local file with no `"<Family> Fallback"` face, so the swap shifts layout. Declare it in `text({ fonts })` instead. |
| X021 | `font-display: block` or `auto`, which hide text while the font loads |
| X022 | A hand-written `@font-face` with no `unicode-range`, or a font build over budget: 100 KB of preloads or 1.5 KB of font CSS (brotli). Preload fewer faces or use fewer weights. |
| X023 | A preload that no `@font-face` uses |

Text size has its own codes, for readers who zoom: X005 is a `font-size` in viewport units with no `rem` term, and X006
a fluid `clamp()` whose range is too wide for 200% zoom to double it. [Accessibility](/learn/accessibility) covers
those.

:::note Fonts and canvas text
The same plugin provides `text.measure`, line breaking for text drawn in a canvas surface, loaded only when something
measures. `measure: 'off'` removes it. [Text, media and shapes](/learn/text-media-and-shapes) shows where it's used.
:::

## Recap

- Declare every face in `text({ fonts })` in `weft.config.ts`; there's nothing to import in components.
- The build subsets faces, preloads `body` and `display`, and writes a `"<Family> Fallback"` face matched to each font's
  metrics, so the swap doesn't move the layout.
- Name the face and its fallback face in your CSS, or in `warp({ fonts })` for warp's roles.
- A production build pins unused variable axes and splits rare latin characters into a lazy file; name an axis in `axes`
  to keep it.
- X020–X023 catch hand-written font CSS that shifts layout, hides text, or loads too much.

## Try it

:::challenge Replace a hand-written @font-face
This stylesheet loads a font by hand. `weft check` reports X020, X021 and X022 on it. Move the font into `text()` and
fix the CSS that uses it.

```css
@font-face {
  font-family: "Lora";
  src: url("/fonts/lora.woff2") format("woff2");
  font-display: block;
}
article { font-family: "Lora", serif; }
```
:::solution
```ts
import { defineConfig } from '@weft-js/core/config'
import { text } from '@weft-js/text'

export default defineConfig({
  plugins: [
    text({
      fonts: {
        body: {
          family: 'Lora',
          src: 'public/fonts/lora.woff2',
          fallback: 'Georgia',
          axes: { wght: [400, 700] },
        },
      },
    }),
  ],
})
```

```css
article { font-family: "Lora", "Lora Fallback", Georgia, serif; }
```

Delete the `@font-face`: the build writes it, subset by `unicode-range` (X022), with `font-display: swap` (X021) and a
Georgia face matched to Lora's metrics (X020). Naming `"Lora Fallback"` in the stack is what puts that matched face to
use.
:::

:::challenge Only what the first paint needs
Your app has a body face, a display face for headings, and a mono face used only in code samples further down some
pages. Write the `fonts` so the first paint waits for the first two and not the third.
:::solution
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
        display: {
          family: 'Space Grotesk',
          src: 'assets/fonts/space-grotesk.woff2',
          fallback: 'Arial',
          axes: { wght: [300, 700] },
        },
        mono: {
          family: 'IBM Plex Mono',
          src: 'assets/fonts/plex-mono.woff2',
          fallback: 'Courier New',
          weight: 400,
        },
      },
    }),
  ],
})
```

`body` and `display` preload by default and any other role doesn't, so `mono` loads when a page's CSS first uses it.
Writing `preload: false` on it would say the same thing explicitly.
:::

:::challenge An axis a dependency sets
You use Fraunces for headings, and a small UI package you installed softens it on hover with
`font-variation-settings: "SOFT" 100` in its own CSS. In `weft dev` the hover works; in production it does nothing.
Why, and what's the fix?
:::solution
The trim reads only your own source for `font-variation-settings`. Your source never sets `SOFT`, so the build pins it to
the font's default and removes the axis from the file. The package's CSS then asks for an axis the font no longer has.
Name the axis so it's kept whatever the source says:

```ts
import { defineConfig } from '@weft-js/core/config'
import { text } from '@weft-js/text'

export default defineConfig({
  plugins: [
    text({
      fonts: {
        display: {
          family: 'Fraunces',
          src: 'assets/fonts/fraunces.woff2',
          fallback: 'Georgia',
          axes: { wght: [100, 900], SOFT: [0, 100] },
        },
      },
    }),
  ],
})
```

`weft dev` always serves whole faces, which is why it worked there.
:::
