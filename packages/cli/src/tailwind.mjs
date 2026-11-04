// Tailwind v4 for a weft app (research 34 §5). `create-weft --ui tailwind` and `weft add tailwind` write the same files,
// and a create-weft test holds them equal, because create-weft can't depend on the CLI.

export const packages = { tailwindcss: '4.3.3', '@tailwindcss/vite': '4.3.3' }

export const viteConfig = `import tailwindcss from '@tailwindcss/vite'

export default { plugins: [tailwindcss()] }
`

/**
 * The top of the app's CSS. With warp, Tailwind's reset stays out: its `base` layer comes after `warp`, so it would
 * beat every warp component. warp brings its own base. Layer order has to be declared before any import.
 */
export const cssEntry = (warp) =>
  warp
    ? `@layer warp, theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@import "@weft-js/warp/tailwind.css";
`
    : `@import "tailwindcss";
`
