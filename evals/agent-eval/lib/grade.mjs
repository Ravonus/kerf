// Hidden tests against the running app. Works on a clone so a build can't touch what the agent is still working on, and
// builds and serves inside the same box, because this is agent-written code. Tests and measures run outside it.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { run } from './browser.mjs'
import { normalizeOverrides } from './pnpm-policy.mjs'
import { boxed, env } from './sandbox.mjs'

export { hidden } from './hidden.mjs'
export { quality } from './quality.mjs'

const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })

/** A second box the agent never sees, holding a clone of its app. */
export function cloneForGrading(box, n) {
  const root = `${box.root}-grade${n}`
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  const copy = { root, app: join(root, 'app'), home: join(root, 'home'), tmp: join(root, 'tmp') }
  mkdirSync(copy.home)
  mkdirSync(copy.tmp)
  // Clones, and symlinks stay symlinks: a built app has to resolve the way it did for the agent.
  return run('/bin/cp', ['-cRP', box.app, copy.app]).then(() => {
    normalizeOverrides(copy.app)
    return copy
  })
}

export async function build(copy, stack) {
  for (const d of stack.built) rmSync(join(copy.app, d), { recursive: true, force: true })
  const environment = stack.calibrationPnpm
    ? env(copy, {
        PATH: `${join(copy.app, '.calibration-bin')}:${env(copy).PATH}`,
        FORCE_COLOR: '0',
      })
    : env(copy)
  const [cmd, argv] = boxed(copy, 'pnpm', ['run', 'build'])
  const at = Date.now()
  try {
    if (stack.calibrationPnpm) {
      const [typeCmd, typeArgs] = boxed(copy, 'pnpm', ['run', 'typecheck'])
      await run(typeCmd, typeArgs, {
        cwd: copy.app,
        env: environment,
        timeout: 300_000,
        maxBuffer: 1 << 26,
      })
    }
    await run(cmd, argv, { cwd: copy.app, env: environment, timeout: 300_000, maxBuffer: 1 << 26 })
    return { ok: true, ms: Date.now() - at }
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - at,
      error: `${e.stdout ?? ''}\n${e.stderr ?? ''}`,
    }
  }
}

function spawnServer(copy, stack, port) {
  const argv0 = stack.serve.map((a) => a.replace('{port}', port))
  const [cmd, argv] = boxed(copy, argv0[0], argv0.slice(1))
  return spawn(cmd, argv, {
    cwd: copy.app,
    env: env(copy, {
      PORT: String(port),
      HOST: '127.0.0.1',
      ...(stack.calibrationPnpm
        ? {
            PATH: `${join(copy.app, '.calibration-bin')}:${env(copy).PATH}`,
          }
        : {}),
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
}

export async function serve(copy, stack) {
  const port = await freePort()
  const child = spawnServer(copy, stack, port)
  let output = ''
  child.stdout.on('data', (d) => {
    output += d
  })
  child.stderr.on('data', (d) => {
    output += d
  })
  const base = `http://127.0.0.1:${port}`
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }
  for (const end = Date.now() + 30_000; Date.now() < end;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).status < 500)
        return { base, stop }
    } catch {}
    await new Promise((r) => {
      setTimeout(r, 200)
    })
  }
  stop()
  throw new Error(`server never answered: ${output}`)
}
