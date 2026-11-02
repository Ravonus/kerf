// The shapes fixture's client entry: the same hydration probe as test/fixtures/app.
import { start } from '@weft-js/start/client'
import { hydration } from '@weft-js/core/dom'
import * as routes from 'virtual:weft/routes'

const writes: MutationRecord[] = []
const observer = new MutationObserver(r => writes.push(...r))
observer.observe(document.getElementById('app')!, { subtree: true, childList: true, attributes: true, characterData: true })
start(routes as any).then(() => {
  writes.push(...observer.takeRecords())
  observer.disconnect()
  ;(window as any).__weft = { misses: hydration.misses, writes: writes.length, hydrated: true }
})
