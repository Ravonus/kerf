// Run the Start fixture's production error protocol against each runtime.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const secret = 'internal recovery fixture fault'
const token = () => '?token=' + randomUUID()
const reference = (response) => {
  const ref = response.headers.get('x-kerf-error')
  assert.match(ref ?? '', /^[0-9a-f]{24}$/)
  return ref
}

export default async function errors({ url, log }) {
  const checks = []
  const checked = (name) => {
    log(name)
    checks.push(name)
  }
  const path = '/recover/loader' + token() + '&fail=2'
  const initial = await fetch(url + path)
  const ref = reference(initial)
  assert.equal(initial.status, 500)
  const html = await initial.text()
  assert.ok(html.includes(ref))
  assert.ok(!html.includes(secret) && !html.includes('"stack"'))
  checked('SSR error page uses its response reference and keeps fault details private')

  const failure = await fetch(url + '/_kerf/data' + path)
  const failed = await failure.json()
  assert.equal(failed.s, 500)
  assert.equal(failed.m.at(-1).data.reference, reference(failure))
  assert.notEqual(reference(failure), ref)
  assert.ok(!JSON.stringify(failed).includes(secret))
  const retry = await fetch(url + '/_kerf/data' + path)
  const recovered = await retry.json()
  assert.equal(recovered.s, 200)
  assert.equal(recovered.m.at(-1).data.attempt, 3)
  checked('a second failure has a new reference and a fresh route read recovers')

  const streamPath = '/recover/stream' + token()
  const stream = await fetch(url + streamPath)
  assert.equal(stream.status, 200)
  const reader = stream.body.getReader()
  const decoder = new TextDecoder()
  let output = ''
  for (;;) {
    const { done, value } = await reader.read()
    assert.ok(!done, 'the shell ended before the pending view')
    output += decoder.decode(value, { stream: true })
    if (output.includes('waiting-for-failure')) break
  }
  const release = await fetch(url + streamPath.replace('/stream?', '/release?'))
  await release.text()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    output += decoder.decode(value, { stream: true })
  }
  assert.ok(output.includes('id="kerf-route-error"'))
  assert.ok(output.includes(reference(stream)))
  assert.ok(!output.includes(secret) && !output.includes('"stack"'))
  checked('a streamed failure carries the same reference after its 200 shell')
  return { checks }
}
