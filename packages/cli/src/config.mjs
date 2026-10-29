// `defineConfig` for weft.config.ts. Identity at runtime; the types (config.d.ts) are the point.
// PLAN §8 names this `weft/config`; the CLI's loader maps that specifier here until packages/weft ships it.

/** @type {import('./config').defineConfig} */
export const defineConfig = config => config
