import { clientFetch } from '@kerf-js/start'
import { start } from '@kerf-js/start/client'
import * as routes from 'virtual:kerf/routes'

clientFetch((path, init) => {
  const peer = sessionStorage.peer
  const target = new URL(peer ? '/peers/' + peer + path : path, location.origin)
  if (sessionStorage.attack && target.pathname.endsWith('/items/42'))
    target.searchParams.set('attack', sessionStorage.attack)
  return fetch(target, init)
})
void start(routes)
