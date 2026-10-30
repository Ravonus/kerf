// `defineConfig` for weft.config.ts. Identity at runtime; the types (config.d.ts) are the point.
// Apps import it from `weft/config`; the CLI's loader falls back here when a project's weft doesn't resolve.

/** @type {import('weft/config').defineConfig} */
export const defineConfig = config => config
