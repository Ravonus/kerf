// Tailwind v4 for a kerf app (research 34 §5). `create-kerf --ui tailwind` and `kerf add tailwind` write the same files,
// and a create-kerf test holds them equal, because create-kerf can't depend on the CLI.

export const packages = { tailwindcss: '4.3.3', '@tailwindcss/vite': '4.3.3' }

export const viteConfig = `import tailwindcss from '@tailwindcss/vite'

export default { plugins: [tailwindcss()] }
`

/**
 * The top of the app's CSS. With veneer, Tailwind's reset stays out: its `base` layer comes after `veneer`, so it would
 * beat every veneer component. veneer brings its own base. Layer order has to be declared before any import.
 */
export const cssEntry = (veneer) =>
  veneer
    ? `@layer veneer, theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@import "@kerf-js/veneer/tailwind.css";
`
    : `@import "tailwindcss";
`
