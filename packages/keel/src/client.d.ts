// Ambient types for `?paint` imports: add `"types": ["@kerf-js/keel/client"]` to tsconfig.

/** `./card.paint.json?paint`: a surface painted at build, as `@kerf-js/core/media`'s record. */
declare module '*?paint' {
  import type { MediaAsset } from '@kerf-js/core/media'
  const asset: MediaAsset
  /** The painted image's record: its AVIF ladder and placeholder with `media()`, the PNG alone without. */
  export default asset
}
