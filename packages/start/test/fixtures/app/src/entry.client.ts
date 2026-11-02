// The fixture's client entry: start() with a probe around hydration for the e2e tests (DOM writes, key misses).
import 'weft:fonts'
import './entry.css'
import { start } from '@weft-js/start/client'
import { hydration } from '@weft-js/core/dom'
import * as routes from 'virtual:weft/routes'

const writes: MutationRecord[] = []
const observer = new MutationObserver(r => writes.push(...r))
observer.observe(document.getElementById('app')!, { subtree: true, childList: true, attributes: true, characterData: true })
// `?boot`: the way an app's page starts, with no code until it's needed. Everything else starts now, for the probe.
start(routes as any, { eager: !location.search.includes('boot') }).then(() => {
  writes.push(...observer.takeRecords())
  observer.disconnect()
  ;(window as any).__weft = { misses: hydration.misses, writes: writes.length, hydrated: true }
})
