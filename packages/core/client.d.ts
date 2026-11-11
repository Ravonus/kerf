// Ambient types for @weft-js/core/vite's virtual imports. Add `"types": ["@weft-js/core/client"]` to tsconfig (create-weft does).

/** Side-effect stylesheet imports: TypeScript 7 checks those by default (TS2882). */
declare module '*.css' {}

declare module '*?media' {
  import type { MediaAsset } from '@weft-js/core/media'
  const asset: MediaAsset
  /** The processed asset, see `@weft-js/core/media`. */
  export default asset
}

/** `./painted.png?media&photo`: a lossless source encoded as a photo, with a JPEG fallback rather than PNG. */
declare module '*?media&photo' {
  import type { MediaAsset } from '@weft-js/core/media'
  const asset: MediaAsset
  /** The processed asset, see `@weft-js/core/media`. */
  export default asset
}

/** `./loop.gif?media&audio=./beat.opus`: the audio muxed into the video at build. */
declare module '*?media&audio=*' {
  import type { MediaAsset } from '@weft-js/core/media'
  const asset: MediaAsset
  /** The processed asset, see `@weft-js/core/media`. */
  export default asset
}

/** Design tokens the `weft:tokens/*` plugin virtual modules emit as CSS. */
declare module 'weft:tokens/*' {}

/** The `font.build` provider's @font-face rules and matched fallback faces (empty without one). `@weft-js/core/vite` imports it for you. */
declare module 'weft:fonts' {}

declare module 'weft:fonts/preloads' {
  /** Above-the-fold font files to preload: `<link rel="preload" as="font" type crossorigin href>`. */
  export const preloads: { href: string; type: string }[]
}
