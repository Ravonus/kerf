// Exercise the real install and backend dispatch paths with local stand-ins.
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dispatch } from './dispatch.mjs'
import { install } from './install.mjs'

export async function fixture(mode) {
  if (!['success', 'failure'].includes(mode)) throw new Error('unknown fixture')
  const dir = mkdtempSync(join(tmpdir(), 'kerf-eval-fixture-'))
  const app = join(dir, 'app')
  let installs = 0
  try {
    install({
      dir,
      app,
      registry: 'http://localhost:4873/',
      commands: { create: [['pnpm', 'create']], after: [['pnpm', 'install']] },
      environment: { PATH: process.env.PATH, npm_config_min_release_age: '0' },
      execute: (cmd, _args, options) => {
        if (cmd !== 'pnpm' || options.env.npm_config_min_release_age)
          throw new Error('unsafe install')
        if (!readFileSync(join(options.cwd, 'pnpm-workspace.yaml'), 'utf8').includes('4320'))
          throw new Error('policy missing')
        installs++
        if (options.cwd === dir) mkdirSync(app)
      },
    })
    let grades = 0
    const backend = {
      command: process.execPath,
      prefix: [fileURLToPath(new URL('../test/codex-fixture.mjs', import.meta.url))],
      cwd: app,
      env: { FIXTURE_FAILURE: mode === 'failure' ? '1' : '0' },
      prompt: 'fixture',
      timeoutMs: 5000,
    }
    const result = await dispatch({
      backend,
      grade: async () => {
        grades++
        return true
      },
    })
    return { ...result, installs, grades }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
