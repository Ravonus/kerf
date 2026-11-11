// The fixture's client entry: start() with a probe around hydration for the e2e tests (DOM writes, key misses).
import 'kerf:fonts'
import './entry.css'
import { start } from '@kerf-js/start/client'
import { hydration } from '@kerf-js/core/dom'
import * as routes from 'virtual:kerf/routes'

const writes: MutationRecord[] = []
const observer = new MutationObserver((r) => writes.push(...r))
observer.observe(document.getElementById('app')!, {
  subtree: true,
  childList: true,
  attributes: true,
  characterData: true,
})
// A stream's swaps aren't hydration's writes, and they land while the client loads.
const apart =
  (swap: (...a: unknown[]) => void) =>
  (...a: unknown[]) => {
    writes.push(...observer.takeRecords())
    swap(...a)
    observer.takeRecords()
  }
let $wb = (self as any).$wb && apart((self as any).$wb)
Object.defineProperty(self, '$wb', {
  configurable: true,
  get: () => $wb,
  set: (f) => void ($wb = apart(f)),
})
// `?boot`: the way an app's page starts, with no code until it's needed. Everything else starts now, for the probe.
start(routes as any, { eager: !location.search.includes('boot') }).then(() => {
  writes.push(...observer.takeRecords())
  observer.disconnect()
  ;(window as any).__kerf = { misses: hydration.misses, writes: writes.length, hydrated: true }
})
