// Which package manager `kerf add` installs with. The app's own folder often says nothing: a package in a workspace has
// no lockfile of its own, since the one at the workspace root covers it. So the answer is the nearest lockfile or
// `packageManager` field on the way up from the app, then the manager running this command, then npm.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const INSTALL = {
  pnpm: ['pnpm', 'add'],
  bun: ['bun', 'add'],
  yarn: ['yarn', 'add'],
  deno: ['deno', 'add'],
  npm: ['npm', 'install'],
}

const LOCKS = {
  'pnpm-lock.yaml': 'pnpm',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
  'yarn.lock': 'yarn',
  'deno.lock': 'deno',
  'package-lock.json': 'npm',
}

/** `packageManager: "pnpm@9.1.0"` in this folder's package.json, when it names a manager kerf installs with. */
function declared(dir) {
  try {
    const field = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).packageManager
    const name = typeof field === 'string' ? field.split('@')[0] : undefined
    return name in INSTALL ? name : undefined
  } catch {
    return undefined
  }
}

/** The manager of the nearest folder, from `root` up, that has a lockfile or declares one. */
function nearest(root) {
  for (let dir = root; ; dir = dirname(dir)) {
    const lock = Object.keys(LOCKS).find((file) => existsSync(join(dir, file)))
    const name = lock ? LOCKS[lock] : declared(dir)
    if (name) return name
    if (dirname(dir) === dir) return undefined
  }
}

/**
 * `[command, verb]` to add packages to the app at `root`. `env` and `versions` are the process's, passed in so a test
 * can say which manager or runtime is running the command.
 *
 * @param {string} root
 * @param {Record<string, string | undefined>} [env]
 * @param {{ deno?: string | undefined, bun?: string | undefined }} [versions]
 * @returns {[command: string, verb: string]}
 */
export function installer(root, env = process.env, versions = process.versions) {
  const running = /^(pnpm|yarn|bun|npm)\//.exec(env.npm_config_user_agent ?? '')?.[1]
  const name = nearest(root) ?? (versions.deno ? 'deno' : versions.bun ? 'bun' : (running ?? 'npm'))
  return INSTALL[name]
}
