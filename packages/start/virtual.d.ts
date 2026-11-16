// Types for the modules Start's Vite plugin makes up, for an app that writes its own `src/entry.client.ts`.
// Name it in tsconfig: "types": ["@kerf-js/core/client", "@kerf-js/start/virtual"].

declare module 'virtual:kerf/routes' {
  type Routes = import('@kerf-js/start/client').ClientRoutes
  export const build: Routes['build']
  export const table: Routes['table']
  export const load: Routes['load']
  export const shapes: Routes['shapes']
  export const shapeStyles: Routes['shapeStyles']
  export const islands: Routes['islands']
}
