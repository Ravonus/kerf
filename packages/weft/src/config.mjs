// `defineConfig` for weft.config.ts. Identity at runtime; the types (config.d.ts) are the point.

/** @type {import('./config').defineConfig} */
export const defineConfig = config => config
