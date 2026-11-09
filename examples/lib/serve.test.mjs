// Actual startup and shutdown both need the shared timer, beyond the benchmark's mocked paths.
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { quote, startServer } from './serve.mjs'

await test('a production server starts and stops without a database', async () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-serve-test-'))
  writeFileSync(join(root, 'index.html'), '<p>Owned server</p>')
  const spawn = childProcess.spawn
  let child
  // Record the real child so even a failed readiness check cleans up its process group.
  childProcess.spawn = (...args) => (child = spawn(...args))
  syncBuiltinESMExports()
  let server
  try {
    server = await startServer(
      { name: 'owned fixture', root, log: join(root, 'server.log'), stack: { out: ['.'] } },
      '/',
      { proveBuild: false },
    )
    assert.equal(await (await fetch(server.url)).text(), '<p>Owned server</p>')
    await server.stop()
    assert.ok(child.exitCode !== null || child.signalCode !== null)
    await assert.rejects(fetch(server.url, { signal: AbortSignal.timeout(2000) }))
  } finally {
    if (server?.alive()) await server.stop()
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try {
        if (process.platform === 'win32')
          childProcess.execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)])
        else process.kill(-child.pid, 'SIGKILL')
      } catch {}
    }
    childProcess.spawn = spawn
    syncBuiltinESMExports()
    rmSync(root, { recursive: true, force: true })
  }
})

await test('reports the exit code when a server exits before answering', async () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-serve-exit-'))
  const log = join(root, 'server.log')
  try {
    await assert.rejects(
      startServer(
        {
          name: 'early exit',
          root,
          log,
          start: `${quote(process.execPath)} -e "process.exit(23)"`,
        },
        '/',
        { proveBuild: false },
      ),
      { message: `early exit: server exited (23) before answering, see ${log}` },
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
