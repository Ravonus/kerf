// The fixture's client entry: start() with a probe around hydration for the e2e tests (DOM writes, key misses).
import { start } from '@weft/start/client'
import { hydration } from 'weft/dom'
import * as routes from 'virtual:weft/routes'

const writes: MutationRecord[] = []
const observer = new MutationObserver(r => writes.push(...r))
observer.observe(document.getElementById('app')!, { subtree: true, childList: true, attributes: true, characterData: true })
start(routes as any).then(() => {
  writes.push(...observer.takeRecords())
  observer.disconnect()
  ;(window as any).__weft = { misses: hydration.misses, writes: writes.length, hydrated: true }
})
