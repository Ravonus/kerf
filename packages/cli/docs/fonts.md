# Fonts

`@weft/plugin-text` is the one place an app's fonts are declared. `weft add text` installs it; then:

```ts
import { defineConfig } from 'weft/config'
import { text } from '@weft/plugin-text'

export default defineConfig({
  plugins: [
    text({
      fonts: {
        body: { family: 'Inter', src: 'assets/fonts/inter.woff2', fallback: 'Arial', axes: { wght: [100, 900] } },
        display: { family: 'Fraunces', src: 'assets/fonts/fraunces.woff2', fallback: 'Georgia', weight: 700 },
      },
    }),
  ],
})
```

`src` is relative to the project root (woff2, woff, ttf or otf). `fallback` is a system face: Arial, Helvetica, Times New
Roman, Georgia, Courier New, Verdana. The keys are roles of your choosing; `body` and `display` are preloaded unless a
face sets `preload: false`, others only with `preload: true`. Other options: `display` (`swap`, `optional`, `fallback`),
`weight`, `style`, `axes`, and beside `fonts`, `subsets` (default `['latin']`).

## What the build does

- Subsets each face per `unicode-range` to hashed woff2 files.
- Writes the `@font-face` rules, and a `"<Family> Fallback"` face matched to the font's metrics, so the swap doesn't shift
  layout.
- Adds the preload links to the page's head, before the first byte.

**There is nothing to import.** `weft/vite` loads the generated CSS in the client entry (Start) or the page (an HTML app).
`import 'weft:fonts'` still works and changes nothing. `import { preloads } from 'weft:fonts/preloads'` gives the preload
list to a custom server.

## Using a face

The build declares faces; it doesn't apply them. Name one in your CSS, with its fallback second:

```css
body { font-family: "Inter", "Inter Fallback", sans-serif; }
h1 { font-family: "Fraunces", "Fraunces Fallback", Georgia, serif; }
```

## Diagnostics

| Code | Catches |
|---|---|
| X020 | A hand-written `@font-face`: declare it in `text({ fonts })` |
| X021 | `font-display: block` or `auto`, which hide text while the font loads |
| X022 | Over budget: 100 KB of preloads or 1.5 KB of font CSS (brotli). Preload fewer faces or use fewer weights |
| X023 | A preload no `@font-face` uses |

The plugin also provides `text.measure`, line breaking for canvas text and exact row heights. It loads only when something
measures; `measure: 'off'` removes it. See `weft docs surface`.
