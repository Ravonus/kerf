import { clientFetch, clientSocket } from '@kerf-js/start'
import { start } from '@kerf-js/start/client'
import * as routes from 'virtual:kerf/routes'

clientFetch((path, init) => {
  const peer = sessionStorage.peer
  const target = new URL(peer ? '/peers/' + peer + path : path, location.origin)
  if (sessionStorage.attack && target.pathname.endsWith('/items/42'))
    target.searchParams.set('attack', sessionStorage.attack)
  const attack = sessionStorage.operationAttack
  if (attack && /^\/_kerf\/(fn\/|rt$)/.test(path))
    target.searchParams.set('operationAttack', attack)
  if (path === '/_kerf/bootstrap' && sessionStorage.bootstrapAttack)
    target.searchParams.set('operationAttack', sessionStorage.bootstrapAttack)
  if (path === '/_kerf/bootstrap' && sessionStorage.bootstrapDelay)
    target.searchParams.set('delay', '1')
  return fetch(target, init)
})
if (!sessionStorage.noSocket)
  clientSocket((path) => {
    const target = sessionStorage.peer === 'b' ? sessionStorage.socketB : sessionStorage.socketA
    return target ? new URL(path, target) : path
  })
void start(routes)
