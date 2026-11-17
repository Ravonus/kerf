// Types for generated route modules, named in tsconfig's types for custom client entries.
declare module 'virtual:kerf/routes' {
  import type { ClientRoutes } from '@kerf-js/start/client'
  /** The server build whose route modules this client table loads. */
  export const build: ClientRoutes['build']
  /** Paths and layout ancestry used for client navigation. */
  export const table: ClientRoutes['table']
  /** Lazy page and layout module imports. */
  export const load: ClientRoutes['load']
  /** Navigation skeletons by route level. */
  export const shapes: ClientRoutes['shapes']
  /** Styles needed to present navigation skeletons. */
  export const shapeStyles: ClientRoutes['shapeStyles']
  /** Deferred client islands and their import functions. */
  export const islands: ClientRoutes['islands']
}
