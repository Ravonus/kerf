// Plugin trust (research 13 §2.9): a new permission or changed code is reported and blocked until `kerf plugins approve`.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { addCommand } from '../src/add.mjs'
import { check } from '../src/check.mjs'
import { main } from '../src/cli.mjs'
import { loadConfig, pluginFactory } from '../src/load-config.mjs'
import { buildCommand, devCommand } from '../src/start.mjs'
import {
  approveCommand,
  audit as auditPackage,
  auditCommand,
  grants,
  lockFile,
} from '../src/trust.mjs'
import { bin, project } from './helpers.mjs'

const body = (permissions = '{}', extra = '') =>
  `import { definePlugin } from '@kerf/core/plugin'\n${extra}\nexport default definePlugin({ name: 'acme', version: '1.0.0', permissions: ${permissions}, options: o => o ?? {}, contribute: () => ({}) })\n`
const pkg = {
  name: 'acme',
  version: '1.0.0',
  type: 'module',
  exports: { './plugin': './plugin.mjs' },
}
const installed = (source = body()) => ({
  'node_modules/acme/package.json': JSON.stringify(pkg),
  'node_modules/acme/plugin.mjs': source,
})
const app = (source: string, config = "{ plugins: ['acme'] }") =>
  project({
    ...installed(source),
    'kerf.config.json': config.replace(/(\w+):/g, '"$1":').replaceAll("'", '"'),
  })
const update = (dir: string, source: string) =>
  writeFileSync(join(dir, 'node_modules/acme/plugin.mjs'), source)
const lock = (dir: string) => JSON.parse(readFileSync(join(dir, lockFile), 'utf8'))
const approveWith = approveCommand as (
  dir: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  options: { all?: boolean; names?: string[] },
) => ReturnType<typeof approveCommand>
const approve = async (dir: string, options: { all?: boolean; names?: string[] } = { all: true }) =>
  approveWith(dir, await loadConfig(dir), options)
const audit = async (dir: string) => auditCommand(dir, await loadConfig(dir))
const trust = (r: { diagnostics: { code: string; why: string; fix: { text: string } }[] }) =>
  r.diagnostics.filter((d) => d.code === 'P109' || d.code === 'P110')
const kerf = (...args: string[]) =>
  spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' })
const io = () => {
  const out = { stdout: '', stderr: '' }
  return {
    out,
    sink: {
      stdout: { write: (t: string) => (out.stdout += t) },
      stderr: { write: (t: string) => (out.stderr += t) },
    },
  }
}

describe('the plugin lock', () => {
  // Through the real CLI: a fresh process sees the updated package, as it does after a real install.
  it('reports a new permission, blocks check until it is approved, then passes', () => {
    const dir = app(body())
    expect(kerf('plugins', 'approve', '--all', '--root', dir).status).toBe(0)
    expect(kerf('check', '--root', dir).status).toBe(0)

    update(dir, body(`{ net: ['api.acme.dev'], native: true }`))
    const blocked = kerf('check', '--json', '--root', dir)
    expect(blocked.status).toBe(1)
    const found = trust(JSON.parse(blocked.stdout))
    expect(found.map((d) => d.code)).toEqual(['P109', 'P110'])
    expect(found[0]).toMatchObject({ severity: 'error', owner: 'acme', file: 'kerf.config.json' })
    expect(found[0]!.why).toContain('native, net:api.acme.dev')
    expect(found[0]!.fix.text).toContain('kerf plugins approve acme')

    const audited = kerf('plugins', 'audit', '--root', dir)
    expect(audited.status).toBe(1)
    expect(audited.stderr).toContain('+net:api.acme.dev')

    expect(kerf('plugins', 'approve', 'acme', '--root', dir).status).toBe(0)
    expect(kerf('check', '--root', dir).status).toBe(0)
    expect(lock(dir).plugins.acme.permissions).toEqual(['native', 'net:api.acme.dev'])
  })

  it('blocks a plugin that asks for permissions when there is no lock at all', async () => {
    const dir = app(body(`{ spawn: ['ffmpeg'] }`))
    expect((await check(dir)).diagnostics.map((d) => d.code)).toContain('P109')
    expect(existsSync(join(dir, lockFile))).toBe(false)
  })

  it('stops `kerf build` and `kerf dev` before any build hook runs', async () => {
    const dir = app(body(`{ net: ['x.dev'] }`))
    await expect(buildCommand(dir)).rejects.toMatchObject({
      code: 'E_TRUST',
      message: expect.stringContaining('P109'),
    })
    await expect(devCommand(dir)).rejects.toMatchObject({ code: 'E_TRUST' })
  })

  it('P110: the same version with different code', async () => {
    const dir = app(body())
    await approve(dir)
    update(dir, `${body()}// changed\n`)
    const r = await check(dir)
    expect(trust(r).map((d) => d.code)).toEqual(['P110'])
    expect(r.ok).toBe(false)
  })

  registerLockIntegrityTests()
})

function registerLockIntegrityTests() {
  it('P110: a lock that cannot be read blocks rather than reading as empty, and approve refuses it', async () => {
    const dir = app(body())
    await approve(dir)
    writeFileSync(join(dir, lockFile), '<<<<<<< HEAD\n{}')
    expect(trust(await check(dir)).map((d) => d.code)).toEqual(['P110'])
    await expect(approve(dir)).rejects.toMatchObject({ code: 'E_TRUST' })
  })

  it('an unchanged plugin stays approved, and narrowing a permission needs no approval', async () => {
    const dir = project({
      'kerf.config.ts':
        "import { definePlugin } from '@kerf/core/plugin'\nconst p = definePlugin({ name: 'mine', version: '1.0.0', permissions: { env: ['A', 'B'] }, options: o => o ?? {}, contribute: () => ({}) })\nexport default { plugins: [p()] }\n",
    })
    await approve(dir)
    expect((await audit(dir)).plugins[0]).toMatchObject({
      source: 'config',
      integrity: null,
      blocked: false,
    })
    writeFileSync(
      join(dir, 'kerf.config.ts'),
      readFileSync(join(dir, 'kerf.config.ts'), 'utf8').replace("['A', 'B']", "['A']"),
    )
    expect(await audit(dir)).toMatchObject({
      ok: true,
      plugins: [{ removed: ['env:B'], blocked: false }],
    })
  })

  it("`trust: 'warn'` is the one setting that turns the block off", async () => {
    const dir = app(body(`{ net: ['x.dev'] }`), `{ plugins: ['acme'], trust: 'warn' }`)
    const r = await check(dir)
    expect(trust(r)[0]).toMatchObject({ code: 'P109', severity: 'warning' })
    expect(r.ok).toBe(true)
  })

  it('writes the same lock for any plugin order, with no paths or times in it', async () => {
    const dir = app(body(`{ fs: { read: ['b/**', 'a/**'] }, env: ['X'] }`))
    await approve(dir)
    const text = readFileSync(join(dir, lockFile), 'utf8')
    expect(lock(dir).plugins.acme).toEqual({
      version: '1.0.0',
      integrity: expect.stringMatching(/^sha512-/),
      permissions: ['env:X', 'fs.read:a/**', 'fs.read:b/**'],
      provides: [],
      undeclared: [],
    })
    expect(text).not.toContain(dir)
    await approve(dir)
    expect(readFileSync(join(dir, lockFile), 'utf8')).toBe(text)
  })
}

describe('kerf plugins approve', () => {
  it('shows what is waiting and writes nothing without a name or --all', async () => {
    const dir = app(body(`{ net: ['x.dev'] }`))
    const { sink, out } = io()
    expect(
      await main(
        ['plugins', 'approve', '--json', '--root', dir],
        sink as unknown as { stdout: typeof process.stdout; stderr: typeof process.stderr },
      ),
    ).toBe(1)
    expect(JSON.parse(out.stdout)).toMatchObject({
      ok: false,
      written: false,
      pending: [{ name: 'acme', added: ['net:x.dev'] }],
    })
    expect(existsSync(join(dir, lockFile))).toBe(false)
  })

  it('refuses a name that is not a plugin', async () => {
    const dir = app(body())
    await expect(approve(dir, { names: ['nope'] })).rejects.toMatchObject({ code: 'E_USAGE' })
  })

  it('--all drops plugins that are gone; a named approve leaves them', async () => {
    const dir = app(body())
    await approve(dir)
    writeFileSync(join(dir, 'kerf.config.json'), '{ "plugins": [] }')
    expect((await audit(dir)).stale).toEqual(['acme'])
    await approve(dir)
    expect(lock(dir).plugins).toEqual({})
  })

  it('makes a gitignored lock committable', async () => {
    const dir = app(body())
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.kerf/\n')
    expect(await approve(dir)).toMatchObject({ gitignore: true })
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(
      `node_modules/\n.kerf/*\n!${lockFile}\n`,
    )
    expect(await approve(dir)).toMatchObject({ gitignore: false })
  })
})

describe('kerf plugins audit', () => {
  const uses = async (source: string) => (await audit(app(source))).plugins[0]

  it.each([
    ['fs', "import { readFileSync } from 'node:fs'", 'fs'],
    ['spawn', "import { spawn } from 'child_process'", 'spawn'],
    ['net (module)', "import 'node:https'", 'net'],
    ['net (global)', 'export const get = () => fetch("https://x.dev")', 'net'],
    ['native', 'export const load = () => import("./addon.node")', 'native'],
    ['env', 'export const key = process.env.API_KEY', 'env:API_KEY'],
    ['a whole env read', 'export const all = { ...process.env }', 'env:*'],
    ['a dynamic import', 'export const load = () => import("node:child_process")', 'spawn'],
  ])('finds undeclared %s', async (_, code, need) => {
    const p = await uses(body('{}', code))
    expect(p.undeclared).toEqual([need])
    expect(p.blocked).toBe(true)
    expect(p.uses[0]).toMatchObject({ need, file: 'plugin.mjs', line: 2 })
  })

  it('accepts what was declared, and leaves NODE_ENV alone', async () => {
    const p = await uses(
      body(
        `{ fs: { read: ['a'] }, env: ['KEY'] }`,
        "import fs from 'node:fs'\nexport const k = process.env.KEY + process.env.NODE_ENV",
      ),
    )
    expect(p.undeclared).toEqual([])
  })

  it('follows relative imports and modules named by slots, and says which dependencies it stopped at', async () => {
    const dir = project({
      ...installed(
        `import { definePlugin, defineSlot, provide } from '@kerf/core/plugin'\nimport './lib/a.mjs'\nimport 'left-pad'\nconst build = defineSlot({ id: 'font.build', version: 1, cardinality: 'one', sides: ['build'] })\nexport default definePlugin({ name: 'acme', version: '1.0.0', options: o => o ?? {}, contribute: () => ({ provides: [provide(build, { sides: { build: { module: 'acme/build', export: 'b' } } })] }) })\n`,
      ),
      'node_modules/acme/package.json': JSON.stringify({
        ...pkg,
        exports: { './plugin': './plugin.mjs', './build': './build.mjs' },
      }),
      'node_modules/left-pad/package.json': JSON.stringify({ name: 'left-pad', main: 'index.js' }),
      'node_modules/left-pad/index.js': '',
      'node_modules/acme/lib/a.mjs': "import 'node:child_process'\n",
      'node_modules/acme/build.mjs': "import 'node:fs'\n",
      'kerf.config.json': '{ "plugins": ["acme"] }',
    })
    expect((await audit(dir)).plugins[0]).toMatchObject({
      undeclared: ['fs', 'spawn'],
      dependencies: ['@kerf/core', 'left-pad'],
    })
  })

  it('blocks undeclared use in check even for a plugin that asks for nothing, until it is accepted', async () => {
    const dir = app(body('{}', "import 'node:child_process'"))
    expect(trust(await check(dir))[0]!.why).toContain('uses spawn without declaring it')
    await approve(dir)
    expect(lock(dir).plugins.acme.undeclared).toEqual(['spawn'])
    expect(trust(await check(dir))).toEqual([])
  })

  it.each(['text', 'media', 'keel-pixel', 'veneer'])(
    '%s declares what it uses',
    async (name) => {
      const dir = fileURLToPath(new URL(`../../${name}/`, import.meta.url))
      const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      const mod = await import(
        pathToFileURL(
          createRequire(join(dir, 'package.json')).resolve(
            meta.exports['./plugin'] ? `${meta.name}/plugin` : meta.name,
          ),
        ).href
      )
      const instance = pluginFactory(mod, meta.name)!.value()
      expect(
        auditPackage(dir, dir, {
          permissions: instance.permissions,
          manifest: instance.contribute({ command: 'check', mode: 'development', root: dir }),
        }).undeclared,
      ).toEqual([])
    },
  )
})

describe('kerf add', () => {
  it('says what a plugin asks for and leaves approving to you', async () => {
    const dir = project({
      ...installed(body(`{ net: ['x.dev'] }`)),
      'kerf.config.ts': 'export default {}\n',
    })
    const r = await addCommand(dir, 'acme', { install: false })
    expect(r.approve).toEqual({ added: ['net:x.dev'], undeclared: [] })
    expect(r.actions.at(-1)).toContain('kerf plugins approve acme')
    expect(existsSync(join(dir, lockFile))).toBe(false)
  })

  it('stays quiet for a plugin that asks for nothing', async () => {
    const dir = project({ ...installed(), 'kerf.config.ts': 'export default {}\n' })
    expect(await addCommand(dir, 'acme', { install: false })).not.toHaveProperty('approve')
  })
})

it('grants() flattens permissions, sorted', () => {
  expect(grants({ spawn: ['b'], fs: { write: ['w'], read: ['r'] }, native: true })).toEqual([
    'fs.read:r',
    'fs.write:w',
    'native',
    'spawn:b',
  ])
})
