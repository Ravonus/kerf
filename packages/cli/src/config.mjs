// `defineConfig` for kerf.config.ts. Identity at runtime; the types (config.d.ts) are the point.
// Apps import it from `@kerf-js/core/config`; the CLI's loader falls back here when a project's kerf doesn't resolve.

/** @type {import('@kerf-js/core/config').defineConfig} */
export const defineConfig = (config) => config
