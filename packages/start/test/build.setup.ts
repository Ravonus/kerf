import { freePort } from '../../../scripts/lib/helpers.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { bindProviders, fixture } from './dev-server.setup.mjs'

// Each build runs in its own node process, as `kerf build` does: Nitro's build stalls inside vitest's module runner.
export function build({ preset, ...rest }: { preset: string; [key: string]: unknown }) {
  bindProviders() // the fixture's media route needs its media.server slot
  const opts = JSON.stringify({ ...rest, preset, logLevel: 'error' })
  const r = spawnSync(process.execPath, [join(import.meta.dirname, 'build-app.mjs'), opts], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (r.status !== 0) throw new Error(`${preset} build failed:\n${r.stderr}`)
}
export const out = (preset: string) => join(fixture, `.output-test-${preset}`)

export async function serve(cmd: string, entry: string) {
  const port = await freePort()
  const child = spawn(cmd, [entry], {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
    stdio: 'ignore',
  })
  // Poll the port: Nitro's logger is silent under vitest's NODE_ENV=test, so there is no "Listening" line to wait for.
  let exited
  child.on('exit', (code) => (exited = code))
  for (
    const t0 = Date.now();
    ;
    await new Promise((ok) => {
      setTimeout(ok, 100)
    })
  ) {
    if (exited !== undefined) throw new Error(`${cmd} exited with ${String(exited)}`)
    if (Date.now() - t0 > 20_000) throw new Error(`${cmd} did not listen on ${port}`)
    if (
      await fetch(`http://localhost:${port}/`).then(
        () => true,
        () => false,
      )
    )
      break
  }
  return { url: `http://localhost:${port}`, stop: () => child.kill() }
}
