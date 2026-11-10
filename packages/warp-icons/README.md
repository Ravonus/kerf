# @weft-js/warp-icons

> **Early release (0.1.x).** APIs can change between minor versions.

Weft's own icon set: 651 icons in Warp's three expression tiers, each with a hollow and a solid form. `@weft-js/warp`
depends on it, so an app with Warp already has it.

```bash
npm install @weft-js/warp-icons
```

```tsx
import { CheckIcon } from '@weft-js/warp-icons'

export function Saved() {
  return <p><CheckIcon label="Saved" /> Your changes are saved.</p>
}
```

An icon you don't import costs nothing, and one you do adds about 164 B of brotli.

## Docs

`weft docs icons` has the names and variants, sizes, tiers, `icons({ tier })` for `weft.config.ts`, and what happens with
a name the build can't follow. Its source is [packages/cli/docs/icons.md](../cli/docs/icons.md).

`pnpm run sheet` in this folder writes `contact-sheet.html`, where you can browse every icon by tier, variant, size and
theme.

## Links

- [Source](https://github.com/Ravonus/weft/tree/main/packages/warp-icons)
- [Weft on GitHub](https://github.com/Ravonus/weft): the framework, the docs and every package
- [Changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md)
- [Issues](https://github.com/Ravonus/weft/issues)
