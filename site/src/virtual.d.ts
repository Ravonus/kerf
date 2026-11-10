/** start's route table, which src/entry.client.ts hands to start(). */
declare module 'virtual:weft/routes' {
  const routes: import('@weft-js/start/client').ClientRoutes
  export = routes
}
