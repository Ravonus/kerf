// Scaffold and install under the same standalone pnpm age policy.
import { execFileSync } from 'node:child_process'
import { pnpmEnv, writePolicy } from '../lib/pnpm-policy.mjs'

export function install({ dir, app, commands, environment, registry, execute = execFileSync }) {
  writePolicy(dir)
  const env = pnpmEnv(environment, registry)
  const run = (cwd, list) => {
    for (const [command, ...args] of list) {
      if (command !== 'pnpm') throw new Error('scaffold commands must use pnpm')
      execute(command, args, { cwd, env, stdio: ['ignore', 'ignore', 'inherit'] })
    }
  }
  run(dir, commands.create)
  writePolicy(app)
  run(app, commands.after)
}
