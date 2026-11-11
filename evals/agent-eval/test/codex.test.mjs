import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { runCodex } from '../lib/codex.mjs'
import { summarize } from '../lib/codex-events.mjs'

const done = {
  type: 'turn.completed',
  usage: { input_tokens: 10, cached_input_tokens: 3, output_tokens: 2 },
}
const command = {
  type: 'item.completed',
  item: {
    type: 'command_execution',
    command: 'cat node_modules/@kerf-js/core/src/a.ts',
    aggregated_output: 'T123 secret-key',
  },
}
test('events yield metrics without retaining transcript or credentials', () => {
  const result = summarize([command, done], 0)
  assert.equal(result.ok, true)
  assert.deepEqual(result.usage, { input: 10, cachedInput: 3, output: 2 })
  assert.equal(result.hadToReadSource, true)
  assert.deepEqual(result.diagnostics, { T123: 1 })
  assert.equal(JSON.stringify(result).includes('secret-key'), false)
  assert.equal(summarize([done], 0).hadToReadSource, null)
})
test('backend failure cannot pass even after a completed event', () => {
  assert.equal(summarize([done, { type: 'turn.failed' }], 0).ok, false)
  assert.equal(summarize([done], 1).ok, false)
  assert.equal(summarize([], 0).ok, false)
})
test('adapter streams prompt and rejects malformed events without leaking stderr', async () => {
  const spawnProcess = (_cmd, args) => {
    assert.ok(args.includes('gpt-6-luna'))
    const child = new EventEmitter()
    child.stdin = new PassThrough()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => {}
    process.nextTick(() => {
      child.stdout.end('not json secret-key\n')
      child.stderr.end('secret-key')
      child.emit('close', 1)
    })
    return child
  }
  const result = await runCodex({
    command: 'fixture',
    cwd: '/',
    env: {},
    prompt: 'test',
    timeoutMs: 1000,
    spawnProcess,
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'malformed-events')
  assert.equal(JSON.stringify(result).includes('secret-key'), false)
})

test('adapter consumes a complete mocked turn', async () => {
  const spawnProcess = (_cmd, args) => {
    assert.equal(args.at(-1), '-')
    const child = new EventEmitter()
    child.stdin = new PassThrough()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => {}
    child.stdin.resume()
    process.nextTick(() => {
      child.stdout.end(`${JSON.stringify(command)}\n${JSON.stringify(done)}\n`)
      child.stderr.end('secret-key')
      child.emit('close', 0)
    })
    return child
  }
  const result = await runCodex({
    command: 'fixture',
    cwd: '/',
    env: {},
    prompt: 'test',
    timeoutMs: 1000,
    spawnProcess,
  })
  assert.equal(result.ok, true)
  assert.equal(result.usage.output, 2)
  assert.equal(JSON.stringify(result).includes('secret-key'), false)
})
