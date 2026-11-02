// `defineConfig` for weft.config.ts. Identity at runtime; the types (config.d.ts) are the point.
// Apps import it from `@weft-js/core/config`; the CLI's loader falls back here when a project's weft doesn't resolve.

/** @type {import('@weft-js/core/config').defineConfig} */
export const defineConfig = config => config
