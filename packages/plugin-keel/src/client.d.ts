// Ambient types for `?paint` and `?gen` imports: add `"types": ["@weft-js/plugin-keel/client"]` to tsconfig.

/** `./card.paint.json?paint`: a surface painted at build, as `@weft-js/core/media`'s record. */
declare module '*?paint' {
  import type { MediaAsset } from '@weft-js/core/media'
  const asset: MediaAsset
  /** The painted image's record: its AVIF ladder and placeholder with `media()`, the PNG alone without. */
  export default asset
}

/** `./plate.gen.json?gen`: each slot's committed basis, from `keelGen()` in `@weft-js/plugin-keel/gen`. */
declare module '*?gen' {
  const slots: Readonly<
    Record<
      string,
      {
        /** The basis file's URL, served and emitted by Vite. */
        readonly basis: string
        readonly kind: string
        readonly dims: unknown
        /** sha256 of the basis bytes. */
        readonly digest: string
        readonly params?: unknown
      }
    >
  >
  export default slots
}
