// The nested fixture's client entry: says when the page has hydrated, as test/fixtures/app does.
import { start } from '@kerf-js/start/client'
import * as routes from 'virtual:kerf/routes'

void start(routes as never, { eager: true }).then(() => {
  ;(window as Window & { __kerf?: object }).__kerf = { hydrated: true }
})
