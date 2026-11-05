// Run the site's QA checks in their original order.
import { b, failed, passed } from './qa/context.mjs'

await import('./qa/fit-and-controls.mjs')
await import('./qa/buttons-and-hubs.mjs')
await import('./qa/hub-and-canvas.mjs')
await import('./qa/learn-navigation.mjs')
await import('./qa/demos-and-calendar.mjs')
await import('./qa/calendar-and-controls.mjs')
await import('./qa/flow-and-code.mjs')
await import('./qa/dial-and-playground.mjs')
await import('./qa/playground-changes.mjs')
await import('./qa/rendered-code.mjs')

await b.close()
console.log(`${passed} passed, ${failed.length} failed`)
for (const f of failed) console.log(`  failed: ${f}`)
if (failed.length) process.exit(1)
