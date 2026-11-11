/** start's route table, which src/entry.client.ts hands to start(). */
declare module 'virtual:kerf/routes' {
  import type { ClientRoutes } from '@kerf-js/start/client'
  const routes: ClientRoutes
  export = routes
}
