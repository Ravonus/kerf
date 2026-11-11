// What Vite and the plugin serve and tsc can't see: a module compiled for the server or for hydration, and glob imports.
declare module '*?kerf-ssr'
declare module '*?kerf-hydrate'

interface ImportMeta {
  glob(pattern: string, options?: { eager?: boolean; query?: string }): Record<string, unknown>
}
