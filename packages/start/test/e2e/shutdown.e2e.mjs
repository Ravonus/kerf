import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { sleep } from '../../../../scripts/lib/sleep.mjs'

async function start(env = {}) {
  const child = spawn(
    process.execPath,
    [new URL('./shutdown-child.mjs', import.meta.url).pathname],
    {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  const [data] = await once(child.stdout, 'data')
  return {
    child,
    port: Number(String(data).trim()),
    records: () =>
      stderr
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  }
}
async function exit(child, limit = 3000) {
  let timer
  try {
    return await Promise.race([
      once(child, 'exit'),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), limit)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

void test('drains requests and services, then exits despite a live handle', async () => {
  const { child, port } = await start({ STOP_DELAY: '300' })
  try {
    const response = new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/`, (res) => {
          res.resume()
          res.on('end', resolve)
        })
        .on('error', reject)
    })
    await sleep(100)
    const started = Date.now()
    child.kill('SIGTERM')
    await response
    assert.equal(child.exitCode, null)
    assert.deepEqual(await exit(child), [0, null])
    assert.ok(Date.now() - started >= 600)
  } finally {
    child.kill('SIGKILL')
  }
})

void test('a second signal forces exit while services are stopping', async () => {
  const { child } = await start({ STOP_DELAY: '10000' })
  try {
    child.kill('SIGTERM')
    await sleep(100)
    child.kill('SIGINT')
    assert.deepEqual(await exit(child), [130, null])
  } finally {
    child.kill('SIGKILL')
  }
})

void test('the HTTP grace window is bounded', async () => {
  const { child, port, records } = await start({ SERVER_SHUTDOWN_TIMEOUT: '1' })
  try {
    const socket = net.connect(port, '127.0.0.1')
    await once(socket, 'connect')
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n')
    child.kill('SIGTERM')
    assert.deepEqual(await exit(child, 2500), [1, null])
    assert.match(records()[0].message, /HTTP drain.*Shutdown timed out/)
    socket.destroy()
  } finally {
    child.kill('SIGKILL')
  }
})

void test('reports a failed cleanup and exits nonzero', async () => {
  const { child, records } = await start({ STOP_FAIL: '1' })
  try {
    child.kill('SIGTERM')
    assert.deepEqual(await exit(child), [1, null])
    assert.equal(records()[0].code, 'E_SHUTDOWN')
    assert.match(records()[0].message, /app cleanup.*shutdown test marker/)
  } finally {
    child.kill('SIGKILL')
  }
})

for (const rejection of [false, true]) {
  void test(`logs one fatal diagnostic and exits after an unowned ${rejection ? 'rejection' : 'exception'}`, async () => {
    const { child, records } = await start(rejection ? { TEST_REJECTION: '1' } : {})
    try {
      child.kill('SIGUSR1')
      assert.deepEqual(await exit(child), [1, null])
      assert.equal(records().length, 1)
      assert.equal(records()[0].code, 'E_PROCESS')
      assert.match(records()[0].reference, /^[0-9a-f]{24}$/)
      assert.match(
        records()[0].message,
        rejection ? /timer rejection marker/ : /timer exception marker/,
      )
    } finally {
      child.kill('SIGKILL')
    }
  })
}
