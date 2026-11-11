# Fonts

`@kerf-js/text` is the one place an app's fonts are declared. `kerf add text` installs it; then:

```ts
import { defineConfig } from '@kerf-js/core/config'
import { text } from '@kerf-js/text'

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

`src` is relative to the project root (woff2, woff, ttf or otf). `fallback` is a system face: Arial, Helvetica, Times New
Roman, Georgia, Courier New, Verdana. The keys are roles of your choosing; `body` and `display` are preloaded unless a
face sets `preload: false`, others only with `preload: true`. Other options: `display` (`swap`, `optional`, `fallback`),
`weight`, `style`, `axes`, and beside `fonts`, `subsets` (default `['latin']`) and `trim` (default `true`).

## What the build does

- Subsets each face per `unicode-range` to hashed woff2 files.
- Writes the `@font-face` rules, and a `"<Family> Fallback"` face matched to the font's metrics, so the swap doesn't shift
  layout.
- Adds the preload links to the page's head, before the first byte.
- Trims each face, in a build only. Font bytes are what hold back the largest paint on a text hero, so nothing here needs
  turning on, and neither cut changes how the page looks or which characters it can show:
  - **Axes.** A custom axis (`SOFT`, `WONK`, `GRAD`…) is pinned to the one value your `font-variation-settings` give it, or
    to the font's default if the source never sets it. An axis set to two values stays. A value kerf can't read from the
    source (`var()`, a template, an expression) keeps every axis. `wght`, `wdth`, `opsz`, `slnt` and `ital` are never
    pinned: CSS drives them. A pinned value applies to every use of the face, so a face used both with and without the
    setting needs the axis declared.
  - **Characters.** `latin` becomes two files. The core is preloaded: ASCII, common punctuation, and every other latin
    character in your source. The rest is fetched through `unicode-range` only by a page that shows one of those
    characters, so text from a database still gets the face, after a fallback-matched swap.

Keep one axis by naming it in `axes`, such as `axes: { SOFT: [0, 100] }`, for values set at runtime or by a dependency's CSS
(only your own source is read). `trim: false` turns all of it off. `kerf dev` always serves whole faces, so an axis you are
editing responds.

**There is nothing to import.** `@kerf-js/core/vite` loads the generated CSS in the client entry (Start) or the page (an HTML app).
`import 'kerf:fonts'` still works and changes nothing. `import { preloads } from 'kerf:fonts/preloads'` gives the preload
list to a custom server.

## A face for a few characters

A face that draws a few letters, such as a script initial, needs only those. `glyphs` lists them: the face becomes one
small file, and its `unicode-range` leaves every other character to the next face in the stack, so no character goes
missing and none fetches the file it isn't in. It replaces `subsets` for that face, and applies in `kerf dev` too.

```ts
text({
  fonts: {
    script: {
      family: 'Mea Culpa',
      src: 'assets/fonts/mea-culpa.ttf',
      fallback: 'Georgia',
      glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      preload: true,
    },
  },
})
```

`glyphs: { selector }` reads the characters from your markup instead: the text of every element the selector matches
(`.class`, `[attr="value"]` or a tag; `[data-role="initial"]` also matches `<Text role="initial">`). With
`first: true` it takes only each one's first letter, as `::first-letter` draws it:

```ts
script: {
  family: 'Mea Culpa',
  src: 'assets/fonts/mea-culpa.ttf',
  fallback: 'Georgia',
  glyphs: { selector: '.narrative', first: true },
},
```

A build reads the scope from your source; `kerf dev` serves the whole face. Text the source holds only as an
expression (`{copy.intro}`), or a selector that matches nothing, keeps the face whole, and `.kerf/fonts.json` says
which element. Then list the characters yourself, or build the list from your copy in the config. CSS that changes
case (`text-transform`) draws characters the source doesn't hold: list those too.

## Using a face

The build declares faces; it doesn't apply them. Name one in your CSS, with its fallback second:

```css
body { font-family: "Inter", "Inter Fallback", sans-serif; }
h1 { font-family: "Fraunces", "Fraunces Fallback", Georgia, serif; }
```

## Diagnostics

| Code | Catches |
|---|---|
| X020 | A hand-written `@font-face` with no `"<Family> Fallback"` face, so the swap shifts layout: declare it in `text({ fonts })` |
| X021 | `font-display: block` or `auto`, which hide text while the font loads |
| X022 | A hand-written `@font-face` with no `unicode-range`, or the font build over budget: 100 KB of preloads or 1.5 KB of font CSS (brotli). Preload fewer faces or use fewer weights |
| X023 | A preload no `@font-face` uses |

The plugin also provides `text.measure`, line breaking for canvas text and exact row heights. It loads only when something
measures; `measure: 'off'` removes it. See `kerf docs surface`.
