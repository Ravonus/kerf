/** start's route table, which src/entry.client.ts hands to start(). */
declare module 'virtual:weft/routes' {
  import type { ClientRoutes } from '@weft-js/start/client'
  const routes: ClientRoutes
  export = routes
}
