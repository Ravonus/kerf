import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { functionRequestsIdle } from '../../packages/start/scripts/request-idle.mjs'

await test('request settling includes overlapping writes and their follow-up reads', async () => {
  const page = new EventEmitter()
  const idle = functionRequestsIdle(page, { quietMs: 20, timeoutMs: 1000 })
  const write = { url: () => '/_weft/fn/write' }, read = { url: () => '/_weft/fn/read' }
  let completedRead = false
  page.emit('request', write)
  const timer = setTimeout(() => {
    page.emit('requestfinished', write)
    page.emit('request', read)
    setTimeout(() => { completedRead = true; page.emit('requestfinished', read) }, 30)
  }, 30)
  try { await idle(); assert.equal(completedRead, true) } finally { clearTimeout(timer) }
})

await test('failed requests settle and unfinished requests fail with a bounded timeout', async () => {
  const page = new EventEmitter()
  const idle = functionRequestsIdle(page, { quietMs: 0, timeoutMs: 30 })
  const request = { url: () => '/_weft/fn/read' }
  page.emit('request', request)
  await assert.rejects(idle(), /did not settle/)
  page.emit('requestfailed', request)
  await idle()
})
