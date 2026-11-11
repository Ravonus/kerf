// Ambient types for `?paint` imports: add `"types": ["@weft-js/plugin-keel/client"]` to tsconfig.

/** `./card.paint.json?paint`: a surface painted at build, as `@weft-js/core/media`'s record. */
declare module '*?paint' {
  import type { MediaAsset } from '@weft-js/core/media'
  const asset: MediaAsset
  /** The painted image's record: its AVIF ladder and placeholder with `media()`, the PNG alone without. */
  export default asset
}
