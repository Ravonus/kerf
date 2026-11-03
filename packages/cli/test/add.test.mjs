// `weft add` (research 34 §7): one insert into any config format, and no change at all when it can't be sure.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addCommand, pinned } from '../src/add.mjs'
import { DB_COMMANDS } from '../src/start.mjs'
import { loadConfig } from '../src/load-config.mjs'
import { project } from './helpers.mjs'

const plugin = "import { definePlugin } from '@weft-js/core/plugin'\nexport default definePlugin({ name: 'acme', options: o => o ?? {}, contribute: () => ({}) })\n"
const acme = { 'node_modules/acme/package.json': JSON.stringify({ name: 'acme', type: 'module', exports: { './plugin': './plugin.mjs' } }), 'node_modules/acme/plugin.mjs': plugin }
const add = (dir, name = 'acme') => addCommand(dir, name, { install: false })
const read = (dir, file) => readFileSync(join(dir, file), 'utf8')
const names = async dir => (await loadConfig(dir)).config.plugins?.map(p => p.name)

describe('weft add rust', () => {
  const app = () => project({ 'package.json': JSON.stringify({ name: 'a', dependencies: { zod: '4' } }), 'src/routes/index.tsx': 'export default () => <p />\n' })
  const rust = (dir, name, options) => addCommand(dir, 'rust', { install: false, engine: name, ...options })

  it('writes a native crate, its module and the one place targets are named', async () => {
    const dir = app()
    const r = await rust(dir, 'image-tools')
    expect(r).toMatchObject({ ok: true, service: 'image-tools', kind: 'native' })
    expect(read(dir, 'src/server/rust.ts')).toContain("import { native } from '@weft-js/start/rust'")
    expect(read(dir, 'src/server/rust.ts')).toContain("export const imageTools = native('image-tools')")
    expect(read(dir, 'src/server/image-tools.ts')).toContain('impl: imageTools')
    expect(read(dir, 'crates/image-tools/Cargo.toml')).toMatch(/crate-type = \["cdylib"\]/)
    expect(read(dir, 'crates/image-tools/Cargo.toml')).toMatch(/weft = \{ path = "[^"]*crates\/weft", default-features = false, features = \["native"\] \}/)
    expect(read(dir, 'crates/image-tools/rust-toolchain.toml')).toContain('wasm32-unknown-unknown')
    expect(read(dir, 'crates/image-tools/src/lib.rs')).toContain('weft::native!(contract::functions(ImageTools));')
    expect(read(dir, 'crates/image-tools/build.rs')).toContain('generate("image-tools")')
    expect(read(dir, '.gitignore')).toContain('target/')
  })

  it('writes a sidecar with --remote, and a second target joins the first', async () => {
    const dir = app()
    await rust(dir, 'media')
    expect((await rust(dir, 'search', { remote: true })).kind).toBe('remote')
    const named = read(dir, 'src/server/rust.ts')
    expect(named).toContain("export const media = native('media')")
    expect(named).toContain("export const search = remote('rust://search')")
    expect(read(dir, 'crates/search/src/main.rs')).toContain('weft::serve(weft::router(')
    expect(read(dir, 'crates/search/Cargo.toml')).not.toContain('cdylib')
  })

  it('changes nothing when the name is taken, or on a dry run', async () => {
    const dir = app()
    expect((await rust(dir, 'media', { dryRun: true })).dryRun).toBe(true)
    expect(existsSync(join(dir, 'crates'))).toBe(false)
    await rust(dir, 'media')
    await expect(rust(dir, 'media')).rejects.toMatchObject({ code: 'E_ADD', message: expect.stringContaining('crates/media') })
    await expect(rust(dir, 'Bad Name')).rejects.toMatchObject({ code: 'E_USAGE' })
  })
})

describe('weft add', () => {
  it.each([
    ['an existing plugins array', "import { defineConfig } from '@weft-js/core/config'\n\nexport default defineConfig({\n  plugins: [],\n})\n"],
    ['no plugins key', "export default {\n  site: { name: 'A' },\n}\n"],
    ['an empty config', 'export default {}\n'],
  ])('edits weft.config.ts with %s', async (_, text) => {
    const dir = project({ ...acme, 'weft.config.ts': text })
    await add(dir)
    expect(await names(dir)).toEqual(['acme'])
    expect(read(dir, 'weft.config.ts')).toContain("import acme from 'acme/plugin'")
  })

  it('writes a named import for a package without a default export', async () => {
    const named = plugin.replace('export default definePlugin', 'export const acme = definePlugin')
    const dir = project({ ...acme, 'node_modules/acme/plugin.mjs': named, 'weft.config.ts': 'export default {}\n' })
    await add(dir)
    expect(read(dir, 'weft.config.ts')).toContain("import { acme } from 'acme/plugin'")
    expect(await names(dir)).toEqual(['acme'])
  })

  it('appends to a list, keeping what is there', async () => {
    const dir = project({ ...acme, 'weft.config.yaml': '# ours\nsite: { name: A }\n' })
    await add(dir)
    expect(read(dir, 'weft.config.yaml')).toContain('# ours')
    expect(await names(dir)).toEqual(['acme'])
  })

  it('edits weft.config.json', async () => {
    const dir = project({ ...acme, 'weft.config.json': '{ "site": { "name": "A" } }' })
    await add(dir)
    expect(await names(dir)).toEqual(['acme'])
  })

  it('is safe to run twice', async () => {
    const dir = project({ ...acme, 'weft.config.ts': 'export default {}\n' })
    await add(dir)
    const text = read(dir, 'weft.config.ts')
    expect(await add(dir)).toMatchObject({ already: true })
    expect(read(dir, 'weft.config.ts')).toBe(text)
  })

  it('--dry-run changes nothing', async () => {
    const dir = project({ ...acme, 'weft.config.ts': 'export default {}\n' })
    expect((await addCommand(dir, 'acme', { dryRun: true })).actions).toEqual(['install acme with npm', 'add acme to weft.config.ts'])
    expect(read(dir, 'weft.config.ts')).toBe('export default {}\n')
  })

  it('stops at a config it cannot read, and puts back one that stops loading', async () => {
    const computed = "const plugins = []\nexport default { plugins }\n"
    const a = project({ ...acme, 'weft.config.ts': computed })
    await expect(add(a)).rejects.toThrow('by hand')
    expect(read(a, 'weft.config.ts')).toBe(computed)
    const b = project({ 'weft.config.yaml': 'site: { name: A }\n' })
    await expect(add(b, 'ghost')).rejects.toThrow('back as it was')
    expect(read(b, 'weft.config.yaml')).toBe('site: { name: A }\n')
  })

  // The app's own failure: a config written first, then `weft add`. Importing it before the install left the module
  // resolver sure the package had no `exports`, so the load after a good install failed with a P007 about `index.js`.
  it('installs a package the config already imports, and leaves the config alone', async () => {
    const config = "import acme from 'acme/plugin'\nexport default { plugins: [acme()] }\n"
    const dir = project({ 'weft.config.ts': config, 'package.json': '{"name":"app"}' })
    const bin = join(dir, 'fake-bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'npm'), `#!/bin/sh\nmkdir -p node_modules/acme\ncp ${JSON.stringify(join(dir, 'pkg'))}/* node_modules/acme/\n`, { mode: 0o755 })
    mkdirSync(join(dir, 'pkg'))
    for (const [file, text] of Object.entries(acme)) writeFileSync(join(dir, 'pkg', file.split('/').at(-1)), text)
    const path = process.env.PATH
    process.env.PATH = `${bin}:${path}`
    try {
      const out = await addCommand(dir, 'acme')
      expect(out.actions).toContain('install acme with npm')
      expect(out.actions.join()).not.toContain('add acme to')
    } finally {
      process.env.PATH = path
    }
    expect(read(dir, 'weft.config.ts')).toBe(config)
    expect(await names(dir)).toEqual(['acme'])
    expect((await addCommand(dir, 'acme', { install: false })).already).toBe(true)
  })

  it('auth needs a database, and stops rather than replace a provider', async () => {
    const bare = project({ 'weft.config.ts': 'export default {}\n' })
    await expect(add(bare, 'auth')).rejects.toThrow('weft add db')
    const taken = project({ 'weft.config.ts': 'export default {}\n', 'drizzle.config.ts': '', 'src/auth.server.ts': 'mine\n' })
    await expect(add(taken, 'auth')).rejects.toThrow('already exists')
    expect(read(taken, 'src/auth.server.ts')).toBe('mine\n')
  })

  it('auth on Drizzle writes the tables, the context and the secret', async () => {
    const dir = project({ 'weft.config.ts': 'export default {}\n', 'package.json': '{"name":"a","dependencies":{}}\n' })
    await add(dir, 'db')
    await add(dir, 'auth')
    expect(read(dir, 'src/db/auth.schema.ts')).toContain('sqliteTable')
    expect(read(dir, 'src/db/schema.ts')).toContain("export * from './auth.schema'")
    expect(read(dir, 'src/env.server.ts')).toContain('BETTER_AUTH_SECRET: z.string()')
    expect(read(dir, '.env')).toMatch(/BETTER_AUTH_SECRET=.{40}/)
    expect(read(dir, 'src/context.server.ts')).toContain('session(auth, request)')
    await expect(add(dir, 'auth')).rejects.toThrow('already exists')
  })

  it('the next steps auth prints name only `weft db` commands that exist', async () => {
    const dir = project({ 'weft.config.ts': 'export default {}\n', 'package.json': '{"name":"a","dependencies":{}}\n' })
    await add(dir, 'db')
    const next = (await add(dir, 'auth')).actions.filter(a => a.startsWith('next:')).join('\n')
    for (const [, command] of next.matchAll(/weft db (\w+)/g)) expect(DB_COMMANDS).toContain(command)
    expect(next).toContain('applies on the next request')
  })

  it('no package or doc names a `weft db` command that does not exist', () => {
    const repo = join(import.meta.dirname, '../../..')
    const dirs = [...readdirSync(join(repo, 'packages')).map(p => join(repo, 'packages', p, 'src')), join(repo, 'packages/cli/docs'), join(repo, 'site/content')]
    const named = []
    for (const dir of dirs.filter(d => existsSync(d))) {
      for (const f of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!f.isFile() || !/\.(?:[cm]?[jt]sx?|md)$/.test(f.name)) continue
        for (const [, command] of readFileSync(join(f.parentPath, f.name), 'utf8').matchAll(/weft db (\w+)/g)) named.push(`${command} in ${f.name}`)
      }
    }
    expect(named.filter(n => !DB_COMMANDS.includes(n.split(' ')[0]))).toEqual([])
  })
})

describe('weft add tailwind', () => {
  const app = (deps = {}, extra = {}) => project({ 'package.json': JSON.stringify({ dependencies: deps }), 'src/routes/_layout.tsx': "import { Link } from '@weft-js/start'\n", ...extra })
  const addTw = (dir, o = {}) => addCommand(dir, 'tailwind', { install: false, ...o })

  it('leaves the reset out of a warp app, whose components it would override', async () => {
    const dir = app({ '@weft-js/warp': '0.0.0' })
    await addTw(dir)
    const css = read(dir, 'src/app.css')
    expect(css).toContain('@layer warp, theme, base, components, utilities;')
    expect(css).toContain('@import "@weft-js/warp/tailwind.css"')
    expect(css).not.toContain('@import "tailwindcss";')
    expect(read(dir, 'src/routes/_layout.tsx').startsWith("import '../app.css'\n")).toBe(true)
    expect(read(dir, 'vite.config.ts')).toContain('tailwindcss()')
  })

  it('keeps the CSS an app has, under the imports', async () => {
    const dir = app({}, { 'src/app.css': 'nav { color: red; }\n', 'src/routes/_layout.tsx': "import '../app.css'\n" })
    await addTw(dir)
    expect(read(dir, 'src/app.css')).toBe('@import "tailwindcss";\n\nnav { color: red; }\n')
    expect(read(dir, 'src/routes/_layout.tsx')).toBe("import '../app.css'\n")
  })

  it('adds to a Vite config, and stops at one it can\'t place the plugin in', async () => {
    const dir = app({}, { 'vite.config.ts': 'export default { plugins: [other()] }\n' })
    await addTw(dir)
    expect(read(dir, 'vite.config.ts')).toContain('plugins: [tailwindcss(), other()]')

    const odd = app({}, { 'vite.config.ts': 'export default make()\n' })
    await expect(addTw(odd)).rejects.toMatchObject({ code: 'E_ADD' })
    expect(read(odd, 'vite.config.ts')).toBe('export default make()\n')
  })

  it('dry run changes nothing, and a second run does nothing', async () => {
    const dir = app()
    const planned = await addTw(dir, { dryRun: true })
    expect(planned.dryRun).toBe(true)
    expect(() => read(dir, 'src/app.css')).toThrow()

    const done = app({ tailwindcss: '4.3.3' }, { 'src/app.css': '@import "tailwindcss";\n' })
    expect(await addTw(done)).toMatchObject({ already: true })
  })
})

describe('weft add db', () => {
  const app = (extra = {}) => project({ 'package.json': JSON.stringify({ name: 'shop' }), 'src/routes/index.tsx': 'export default () => null\n', ...extra })
  const addDb = (dir, o = {}) => addCommand(dir, 'db', { install: false, ...o })

  it('writes the wiring and no todo app; a layer brings its plugin', async () => {
    const dir = app({ 'weft.config.ts': 'export default {}\n', 'node_modules/@weft-js/db/package.json': JSON.stringify({ name: '@weft-js/db', type: 'module', exports: { './plugin-native/plugin': './plugin-native/plugin.mjs' } }), 'node_modules/@weft-js/db/plugin-native/plugin.mjs': "import { definePlugin } from '@weft-js/core/plugin'\nexport const native = definePlugin({ name: '@weft-js/db/plugin-native', contribute: () => ({}) })\n" })
    const r = await addDb(dir, { engine: 'mysql', layer: 'native' })
    expect(r.package).toBe('native on mysql')
    expect(read(dir, 'src/db/index.server.ts')).toContain('@weft-js/db/plugin-native/mysql')
    expect(read(dir, '.env')).toContain('mysql://')
    expect(() => read(dir, 'src/server/todos.ts')).toThrow()
    expect(await names(dir)).toEqual(['@weft-js/db/plugin-native'])
  })

  it('keeps an .env, and refuses an app that has a database or a file in the way', async () => {
    const dir = app({ '.env': 'KEY=1\n' })
    await addDb(dir)
    expect(read(dir, '.env')).toMatch(/^KEY=1\nDATABASE_URL=/)
    await expect(addDb(dir)).rejects.toMatchObject({ code: 'E_ADD' })

    const context = app({ 'src/context.server.ts': 'export default () => ({})\n' })
    await expect(addDb(context)).rejects.toThrow('context.server.ts')
    expect(() => read(context, '.env')).toThrow()
  })

  it('names what it takes', async () => {
    await expect(addDb(app(), { engine: 'oracle' })).rejects.toMatchObject({ code: 'E_USAGE' })
    await expect(addDb(app(), { layer: 'sequel' })).rejects.toMatchObject({ code: 'E_USAGE' })
  })

  it('installs a package an app has as a local tarball from that tarball', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weft-add-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ overrides: { '@weft-js/warp': 'file:/x/warp.tgz', zod: '4.0.0' } }))
    expect(pinned(dir, ['@weft-js/warp@0.0.0', 'zod@4.6.7'])).toEqual(['zod@4.6.7'])
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies).toEqual({ '@weft-js/warp': 'file:/x/warp.tgz' })
  })

  describe('a plugin with `setup`', () => {
    const source = `import { definePlugin } from '@weft-js/core/plugin'\nconst setup = { needs: ['db'], with: ['helper'], run: ({ engine, read }) => ({ files: { 'src/kit.server.ts': \`// \${engine}\\n\` }, edits: { 'src/env.server.ts': read('src/env.server.ts') + '// kit\\n' }, env: { KIT_KEY: 'placeholder' }, next: ['\`weft kit\`'] }) }\nexport default definePlugin({ name: 'kit', contribute: () => ({ setup }) })\n`
    const pkg = (name, text) => ({ [`node_modules/${name}/package.json`]: JSON.stringify({ name, type: 'module', exports: { './plugin': './plugin.mjs' } }), [`node_modules/${name}/plugin.mjs`]: text })
    const withKit = (extra = {}) => project({ ...pkg('kit', source), ...pkg('helper', plugin.replace("'acme'", "'helper'")), 'weft.config.ts': 'export default {}\n', 'src/db/schema.ts': "export {}\n", 'drizzle.config.ts': "import { defineConfig } from 'drizzle-kit'\n\nexport default defineConfig({ dialect: 'sqlite', schema: './src/db/schema.ts', out: './drizzle' })\n", 'src/db/index.server.ts': "import { createDb } from '@weft-js/start/db/sqlite'\nexport const db = createDb({ schema: {}, url: 'file:a.db' })\n", 'src/env.server.ts': '// env\n', '.env': 'A=1\n', ...extra })

    it('adds what it comes with, writes its files and placeholder env, and says what is next', async () => {
      const dir = withKit()
      const r = await addCommand(dir, 'kit', { install: false })
      expect(await names(dir)).toEqual(['kit', 'helper'])
      expect(read(dir, 'src/kit.server.ts')).toBe('// sqlite\n')
      expect(read(dir, 'src/env.server.ts')).toBe('// env\n// kit\n')
      expect(read(dir, '.env')).toBe('A=1\nKIT_KEY=placeholder\n')
      expect(read(dir, '.env.example')).toBe('KIT_KEY=placeholder\n')
      expect(r.actions).toContain('next: `weft kit`')
    })

    it('stops with nothing changed when it lacks what it needs, or a file is taken', async () => {
      await expect(addCommand(project({ ...pkg('kit', source), 'weft.config.ts': 'export default {}\n' }), 'kit', { install: false })).rejects.toThrow('weft add db')
      const dir = withKit({ 'src/kit.server.ts': 'mine\n' })
      await expect(addCommand(dir, 'kit', { install: false })).rejects.toThrow('already exist')
      expect(read(dir, 'weft.config.ts')).toBe('export default {}\n')
      expect(read(dir, 'src/kit.server.ts')).toBe('mine\n')
    })

    it('a dry run lists the same and writes nothing', async () => {
      const dir = withKit()
      const r = await addCommand(dir, 'kit', { install: false, dryRun: true })
      expect(r.actions).toContain('write src/kit.server.ts')
      expect(existsSync(join(dir, 'src/kit.server.ts'))).toBe(false)
    })
  })
})

it('an add-on not on npm yet says so, by its short name or its package name, and changes nothing', async () => {
  const dir = project({ 'weft.config.ts': "export default {}\n", 'package-lock.json': '{}' })
  for (const name of ['redis', 'realtime-redis', '@weft-js/realtime-redis']) {
    await expect(addCommand(dir, name)).rejects.toThrow("@weft-js/realtime-redis isn't on npm yet")
  }
  expect(read(dir, 'weft.config.ts')).toBe('export default {}\n')
})
