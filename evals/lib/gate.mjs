// Shared exit-gate helpers keep command failures and recorded check results consistent.
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository root shared by exit gates and their package dependencies. */
export const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)))

/** Resolve local package dependencies by the folder that matches their npm name. */
export const localPackages = (root) => (name) =>
  `file:${join(root, 'packages', name.replace('@weft-js/', ''))}`

/** Create command runners with the gate's working directory and output budget. */
export function commands(dir, maxBuffer, mergeEnv = false) {
  const run = (cmd, args, cwd = dir, env = {}) =>
    spawnSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer,
      ...(mergeEnv && { env: { ...process.env, ...env } }),
    })
  const must = (cmd, args, cwd, env) => {
    const r = run(cmd, args, cwd, env)
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`)
    return r
  }
  return { run, must }
}

/** Poll until a value is ready, retaining the gates' timeout and retry behavior. */
export async function until(what, fn, ms = 60_000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await Promise.resolve()
      .then(fn)
      .catch(() => undefined)
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise((ok) => {
      setTimeout(ok, 50)
    })
  }
}

/** Reject unequal JSON values with a bounded description of the difference. */
export function eq(a, b, what) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(
      `${what}: got ${JSON.stringify(a)?.slice(0, 400)}, want ${JSON.stringify(b)?.slice(0, 400)}`,
    )
}

/** Record each check without stopping the remaining checks after a failure. */
export function makeCheck(checks, log, limit) {
  return async (name, fn) => {
    const t = performance.now()
    try {
      const detail = await fn()
      checks.push({
        name,
        ok: true,
        ms: Math.round(performance.now() - t),
        ...(detail !== undefined && { detail }),
      })
      log(
        `pass: ${name}${detail !== undefined ? ` (${JSON.stringify(detail).slice(0, limit)})` : ''}`,
      )
    } catch (e) {
      checks.push({ name, ok: false, error: e.message })
      log(`FAIL: ${name}\n${e.stack}`)
    }
  }
}
