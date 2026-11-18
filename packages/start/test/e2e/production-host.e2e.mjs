// Build one fixture, then exercise the same packaged Node entry under each failure mode.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort, sleep } from '../../../../scripts/lib/helpers.mjs'
import { build } from '../../src/app.mjs'

const fixture = fileURLToPath(new URL('../fixtures/production-host', import.meta.url))
const tmp = fileURLToPath(new URL('../.tmp/', import.meta.url))
const cli = fileURLToPath(new URL('../../../cli/bin/kerf.mjs', import.meta.url))
const probe = (base, name) => fetch(`${base}/_kerf/${name}`, { signal: AbortSignal.timeout(1000) })

async function launch(root, scenario, throughCli = false) {
  const port = await freePort()
  const entry = throughCli ? [cli, 'start', '--root', root] : ['.output/server/index.mjs']
  const child = spawn(process.execPath, entry, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      KERF_BOOT_TEST_CASE: scenario,
      SERVER_STARTUP_TIMEOUT: '2',
      SERVER_SHUTDOWN_TIMEOUT: '1',
    },
  })
  let output = ''
  let errors = ''
  child.stdout.on('data', (data) => {
    output += data
  })
  child.stderr.on('data', (data) => {
    errors += data
  })
  const closed = once(child, 'close')
  return {
    child,
    base: `http://127.0.0.1:${port}`,
    closed,
    out: () => output,
    diagnostics: () =>
      errors
        .trim()
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line)),
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await closed
    },
  }
}

async function waitFor(check) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return
    await sleep(20)
  }
  assert.fail('startup condition did not arrive')
}

void test(
  'the built Node entry owns startup, readiness and cleanup',
  { timeout: 60_000 },
  async (t) => {
    await mkdir(tmp, { recursive: true })
    const root = await mkdtemp(join(tmp, 'production-host-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    await cp(fixture, root, { recursive: true })
    await build({
      root,
      preset: 'node',
      site: { url: 'http://localhost' },
      nitro: { plugins: [join(root, 'explicit.mjs')], scanDirs: [root] },
      logLevel: 'warn',
    })

    await t.test(
      'waits for explicit, scanned and application startup before listening',
      async (sub) => {
        const host = await launch(root, 'ok')
        sub.after(host.stop)
        await waitFor(() => host.out().includes('explicit waiting'))
        await assert.rejects(probe(host.base, 'health'))
        await waitFor(() =>
          probe(host.base, 'ready').then(
            (reply) => reply.ok,
            () => false,
          ),
        )
        assert.deepEqual(await (await probe(host.base, 'health')).json(), { ok: true })
        assert.equal((await probe(host.base, 'ready')).status, 200)
        host.child.kill('SIGTERM')
        assert.deepEqual(await host.closed, [0, null])
        assert.match(host.out(), /application closed/)
      },
    )

    for (const [scenario, stage, detail] of [
      ['import', 'explicit.mjs', 'plugin import fixture failed'],
      ['sync', 'explicit.mjs', 'plugin initializer fixture failed'],
      ['reject', 'explicit.mjs', 'plugin rejection fixture failed'],
      ['hang', 'explicit.mjs', 'Startup timed out'],
      ['app', 'Kerf application startup', 'app startup fixture failed'],
    ]) {
      await t.test(`exits with a correlated startup diagnostic for ${scenario}`, async (sub) => {
        const host = await launch(root, scenario, scenario === 'reject')
        sub.after(host.stop)
        assert.deepEqual(await host.closed, [1, null])
        await assert.rejects(probe(host.base, 'health'))
        const startup = host.diagnostics().filter(({ code }) => code === 'E_STARTUP')
        assert.equal(startup.length, 1)
        assert.ok(startup[0].message.includes(stage) && startup[0].message.includes(detail))
        assert.match(startup[0].reference, /^[0-9a-f]{24}$/)
        if (scenario !== 'import') assert.match(host.out(), /explicit closed/)
      })
    }

    await t.test('a production timer rejection stops admissions and exits', async (sub) => {
      const host = await launch(root, 'crash')
      sub.after(host.stop)
      await waitFor(() =>
        probe(host.base, 'ready').then(
          (reply) => reply.ok,
          () => false,
        ),
      )
      assert.deepEqual(await host.closed, [1, null])
      await assert.rejects(probe(host.base, 'health'))
      const failures = host.diagnostics().filter(({ code }) => code === 'E_PROCESS')
      assert.equal(failures.length, 1)
      assert.match(failures[0].message, /production fixture timer rejection/)
      assert.match(host.out(), /application closed/)
    })

    await t.test('a failing Nitro close hook still runs the other cleanup', async (sub) => {
      const host = await launch(root, 'cleanup')
      sub.after(host.stop)
      await waitFor(() =>
        probe(host.base, 'ready').then(
          (reply) => reply.ok,
          () => false,
        ),
      )
      host.child.kill('SIGTERM')
      assert.deepEqual(await host.closed, [1, null])
      assert.match(host.out(), /explicit closed/)
      assert.match(host.out(), /application closed/)
      assert.match(host.diagnostics()[0].message, /Nitro close fixture failed/)
    })
  },
)
