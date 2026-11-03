# @weft-js/warp

> **Early release (0.1.1).** APIs will change between minor versions.

warp is weft's UI toolkit: forms, overlays, tables, charts and more, with keyboard and screen reader support built in. The
components and their look are here. Their behaviour is in [`@weft-js/warp-core`](../warp-core), which works without any
framework.

An app made with `npm create @weft-js` gets warp by default (`--ui warp`). To add it to another app:

```bash
npm install @weft-js/warp
```

and add its plugin to `weft.config.ts`:

```ts
import { defineConfig } from '@weft-js/core/config'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({ plugins: [warp()] })
```

Then import what you use. A page pays only for the components it renders.

```tsx
import { state } from '@weft-js/core'
import { Badge, Button, Card } from '@weft-js/warp'

export default function Product() {
  const inCart = state(0)
  return (
    <Card eyebrow="Coffee" title="House blend, 250 g">
      <p>Cart <Badge count>{inCart.value}</Badge></p>
      <Button onClick={() => inCart.value++}>Add to cart</Button>
    </Card>
  )
}
```

The look comes from tokens, so it follows the theme, the density and the expression dial (quiet, balanced or vivid) with
no change to your code. `warp({ seed, fields, dials, radius, fonts, tokens })` sets the app's defaults; `weft docs design`
has the options.

## Docs

- The site's toolkit pages list every component with its props, live examples and keyboard table. The words and
  examples are in `site/src/toolkit`.
- `weft docs design`: the design language and the D-codes `weft check` reports in an app with warp.
- `weft docs icons`: warp's icons.

## Size

An app built with warp has a ceiling of 50 KB of brotli JavaScript and CSS. `evals/warp-exit.mjs` builds the shop app
from the evals with warp and checks it against that.
`npm run size` in this folder prints what each component costs on its own and on a page with the others.
