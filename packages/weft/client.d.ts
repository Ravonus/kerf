// Ambient types for weft/vite's virtual imports. Add `"types": ["weft/client"]` to tsconfig (create-weft does).

declare module '*?media' {
  const asset: import('weft/media').MediaAsset
  export default asset
}

/** The `font.build` provider's @font-face rules and matched fallback faces (empty without one). */
declare module 'weft:fonts' {}

declare module 'weft:fonts/preloads' {
  /** Above-the-fold font files to preload: `<link rel="preload" as="font" type crossorigin href>`. */
  export const preloads: { href: string; type: string }[]
}
