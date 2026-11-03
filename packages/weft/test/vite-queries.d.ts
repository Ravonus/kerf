// What Vite and the plugin serve and tsc can't see: a module compiled for the server or for hydration, and glob imports.
declare module '*?weft-ssr'
declare module '*?weft-hydrate'

interface ImportMeta {
  glob(pattern: string, options?: { eager?: boolean; query?: string }): Record<string, unknown>
}
