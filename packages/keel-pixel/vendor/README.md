# vendor

Built by `scripts/vendor.mjs` from keel-engine 4bcccc7 (MIT; see LICENSE).
The checked patches move the pinned bundles into local modules. Don't edit generated modules directly.

The existing LICENSE is preserved byte-for-byte. At the pinned commit, upstream's LICENSE names
Chad Koslovsky and contributors; the preserved vendored copy names ravonus.

- `keel-render.mjs`: `createPixelRenderer` from `packages/render` and its local modules.
- `keel-theme.mjs`: `recipeTheme` and `themeTokens` from `packages/react/src/design.ts` and their local modules.
- `keel-styles.css`: `packages/react/src/styles.css`.
