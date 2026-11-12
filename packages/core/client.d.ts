// Ambient types for @kerf-js/core/vite's virtual imports. Add `"types": ["@kerf-js/core/client"]` to tsconfig (create-kerf does).

/** Side-effect stylesheet imports: TypeScript 7 checks those by default (TS2882). */
declare module '*.css' {}

declare module '*?media' {
  import type { MediaAsset } from '@kerf-js/core/media'
  const asset: MediaAsset
  /** The processed asset, see `@kerf-js/core/media`. */
  export default asset
}

/** `./painted.png?media&photo`: a lossless source encoded as a photo, with a JPEG fallback rather than PNG. */
declare module '*?media&photo' {
  import type { MediaAsset } from '@kerf-js/core/media'
  const asset: MediaAsset
  /** The processed asset, see `@kerf-js/core/media`. */
  export default asset
}

/** `./loop.gif?media&audio=./beat.opus`: the audio muxed into the video at build. */
declare module '*?media&audio=*' {
  import type { MediaAsset } from '@kerf-js/core/media'
  const asset: MediaAsset
  /** The processed asset, see `@kerf-js/core/media`. */
  export default asset
}

/** Design tokens the `kerf:tokens/*` plugin virtual modules emit as CSS. */
declare module 'kerf:tokens/*' {}

/** The `font.build` provider's @font-face rules and matched fallback faces (empty without one). `@kerf-js/core/vite` imports it for you. */
declare module 'kerf:fonts' {}

declare module 'kerf:fonts/preloads' {
  /** Above-the-fold font files to preload: `<link rel="preload" as="font" type crossorigin href>`. */
  export const preloads: { href: string; type: string }[]
}
