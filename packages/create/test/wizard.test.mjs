// The wizard (research 34 §3): lists with the default selected, flags skip questions, no terminal never prompts.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { questions, resolveChoices, select } from '../src/wizard.mjs'

const bin = fileURLToPath(new URL('../bin/create-weft.mjs', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'create-weft-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const down = '\x1b[B',
  up = '\x1b[A',
  enter = '\r'

/** A fake terminal that presses `keys`, one per question. */
function terminal(...keys) {
  const input = new PassThrough(),
    output = new PassThrough()
  output.resume()
  let shown = ''
  output.on('data', (d) => {
    shown += d
  })
  input.on('resume', () =>
    setImmediate(() => {
      const k = keys.shift()
      if (k !== undefined) input.write(k)
    }),
  )
  return { input, output, shown: () => shown }
}

describe('select', () => {
  const q = {
    label: 'Database',
    default: 'sqlite',
    options: [
      { value: 'sqlite', label: 'SQLite' },
      { value: 'postgres', label: 'Postgres' },
      { value: 'none', label: 'None' },
    ],
  }

  it('Enter keeps the default, and the arrows pick another, wrapping', async () => {
    const io = terminal(enter)
    expect(await select(q, io)).toBe('sqlite')
    expect(io.shown()).toContain('› SQLite')
    expect(await select(q, terminal(down + enter))).toBe('postgres')
    expect(await select(q, terminal(up + enter))).toBe('none')
  })
})

describe('resolveChoices', () => {
  const env = {}
  const defaults = {
    ui: 'warp',
    db: 'sqlite',
    layer: 'drizzle',
    auth: true,
    runtime: 'node',
    config: 'ts',
    pm: 'npm',
  }

  it('--yes is Enter all the way through, the todo + auth app', async () => {
    expect(await resolveChoices({}, { interactive: true, yes: true, env })).toEqual({
      ...defaults,
      git: true,
      install: true,
    })
  })

  it('no terminal takes the same app, and runs nothing it was not asked to', async () => {
    expect(await resolveChoices({}, { interactive: false, env })).toEqual({
      ...defaults,
      git: false,
      install: false,
    })
    expect(await resolveChoices({ install: true }, { interactive: false, env })).toMatchObject({
      install: true,
    })
  })

  it('a flag skips its question, and sign-in is only asked with a database', async () => {
    const keys = questions(env).length - 2
    const io = terminal(...Array(keys).fill(enter))
    expect(
      await resolveChoices({ ui: 'none', db: 'none' }, { interactive: true, env, io }),
    ).toMatchObject({ ui: 'none', db: 'none', auth: false, runtime: 'node' })
    expect(io.shown()).not.toContain('Sign-in')
    expect(io.shown()).not.toContain('Database')
  })

  it('uses the package manager that ran it', async () => {
    expect(
      await resolveChoices(
        {},
        { interactive: false, env: { npm_config_user_agent: 'pnpm/10 node/26' } },
      ),
    ).toMatchObject({ pm: 'pnpm' })
  })
})

it('no database skips the layer and sign-in', async () => {
  expect(await resolveChoices({ db: 'none' }, { interactive: false, env: {} })).toMatchObject({
    layer: 'drizzle',
    auth: false,
  })
})

describe('the command', () => {
  const run = (...args) =>
    spawnSync(process.execPath, [bin, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

  it('with no terminal never prompts: it writes the default app and nothing else', () => {
    const dir = join(tmp, 'plain')
    const r = run(dir)
    expect(r.status).toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies).toHaveProperty(
      'better-auth',
    )
    expect(existsSync(join(dir, '.git'))).toBe(false)
    expect(existsSync(join(dir, 'node_modules'))).toBe(false)
  })

  it('writes the chosen config format', () => {
    for (const [format, file] of [
      ['json', 'weft.config.json'],
      ['yaml', 'weft.config.yaml'],
    ]) {
      const dir = join(tmp, format)
      expect(run(dir, '--config', format, '--db', 'none').status).toBe(0)
      expect(existsSync(join(dir, file))).toBe(true)
      expect(existsSync(join(dir, 'weft.config.ts'))).toBe(false)
    }
  })

  it("needs a directory when it can't ask for one, and refuses a bad choice", () => {
    expect(run().status).toBe(1)
    expect(run(join(tmp, 'bad'), '--ui', 'nope').stderr).toContain('--ui must be one of')
  })
})
