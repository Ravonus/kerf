// Each `--ui` variant scaffolds an app that `kerf check` passes clean and `kerf dev` server-renders. The workspace
// packages stand in for the npm ones through node_modules links.
import { freePort } from '../../../scripts/lib/helpers.mjs'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { agentsMd, limit } from '../../cli/src/agents-md.mjs'
import { check } from '../../cli/src/check.mjs'
import { devCommand } from '../../cli/src/start.mjs'
import { scaffold, template as templateSource } from '../src/index.mjs'

const template = templateSource as (
  options?: Parameters<typeof templateSource>[0],
) => Record<string, string>

const tmp = fileURLToPath(new URL('./.tmp/', import.meta.url))
// A check plus a dev server: a few seconds alone, but the release run has every package's tests going at once, and
// the first app (veneer, the largest) pays the cold start at seven to ten times that.
const serves = { timeout: 180_000 }
// Nitro waits 30 s for the first server import, then fails the request ("Vite environment ssr is unavailable", which the
// error page answers as a 500). A veneer app's import takes about 9 s, past 30 on a loaded gate.
async function firstPage(url: string) {
  for (let i = 0; ; i++) {
    const res = await fetch(url)
    if (res.status < 500 || i === 3) return res
    const body = await res.text()
    if (!body.includes('is unavailable')) return new Response(body, { status: res.status })
  }
}
const pkgs = fileURLToPath(new URL('../../', import.meta.url))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function app(ui: string, options = {}) {
  const dir = join(tmp, `app-${ui}`)
  rmSync(dir, { recursive: true, force: true })
  scaffold(dir, { ui, ...options })
  const deps = Object.keys({
    ...JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies,
    '@kerf-js/cli': 1,
  })
  for (const name of deps.filter((d) => d.startsWith('@kerf-js/'))) {
    mkdirSync(join(dir, 'node_modules', '@kerf-js'), { recursive: true })
    symlinkSync(join(pkgs, name.replace('@kerf-js/', '')), join(dir, 'node_modules', name), 'dir')
  }
  return dir
}

describe.each([
  [
    'veneer',
    /data-scope="surface"[^>]*><span[^>]*data-part="eyebrow">kerf \+ veneer<\/span><span[^>]*data-part="title">Welcome to App Veneer</,
    /<button[^>]*data-scope="button"[^>]*>/,
  ],
  [
    'headless',
    /<section[^>]*class="card"><h1>Welcome to App Headless<\/h1>/,
    /<button type="button">Clicked <!--\[-->0<!--\]--> times/,
  ],
  [
    'none',
    /<section[^>]*class="card"><h1>Welcome to App None<\/h1>/,
    /<button type="button">Clicked <!--\[-->0<!--\]--> times/,
  ],
])('--ui %s', (ui, card, button) => {
  it('kerf check is clean, and / server-renders', serves, async () => {
    const dir = app(ui)
    const r = await check(dir)
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    // Each page has its own `meta`; what's left is the one thing only its owner knows: where it will live.
    expect(r.diagnostics.map((d) => d.code)).toEqual(['H001'])

    const server = await devCommand(dir, { port: await freePort() })
    try {
      const res = await firstPage(server.resolvedUrls.local[0])
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toMatch(card)
      expect(html).toMatch(button)
      expect(html).toMatch(/<a\s/) // static by default, so no hydration key
      expect(html).toMatch(/<title[^>]*>App \w+<\/title>/)
    } finally {
      await server.close()
    }
  })

  it('tsc is clean, on the app and the packages it pulls in', () => {
    const dir = app(ui)
    const tsc = spawnSync(join(pkgs, 'core/node_modules/.bin/tsc'), ['--noEmit'], {
      cwd: dir,
      encoding: 'utf8',
    })
    expect(tsc.stdout).toBe('')
  })
})

it("the alias is the app's: a tsconfig edit is all it takes to use its own", serves, async () => {
  const dir = app('none')
  const file = join(dir, 'tsconfig.json')
  writeFileSync(file, readFileSync(file, 'utf8').replace('"#/*"', '"~/*"'))
  mkdirSync(join(dir, 'src/lib'))
  writeFileSync(join(dir, 'src/lib/label.ts'), "export const label = 'from the alias'\n")
  writeFileSync(
    join(dir, 'src/routes/about.tsx'),
    "import { label } from '~/lib/label'\n\nexport default function About() {\n  return <p>{label}</p>\n}\n",
  )
  expect(
    spawnSync(join(pkgs, 'core/node_modules/.bin/tsc'), ['--noEmit'], {
      cwd: dir,
      encoding: 'utf8',
    }).stdout,
  ).toBe('')
  expect((await check(dir)).diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  const server = await devCommand(dir, { port: await freePort() })
  try {
    expect(await (await fetch(`${server.resolvedUrls.local[0]}about`)).text()).toContain(
      'from the alias',
    )
  } finally {
    await server.close()
  }
})

it('AGENTS.md for the biggest scaffold stays under the limit, plugin sections included', async () => {
  const { text, bytes } = await agentsMd(app('veneer', { db: 'sqlite', auth: true }))
  expect(text).toContain('## Full stack')
  expect(text).toContain('### veneer')
  expect(text).toContain('`#/server/todos`')
  expect(bytes).toBeLessThan(limit)
})

it.each(['json', 'yaml'])(
  'a %s config gives the same app as TypeScript',
  serves,
  async (format) => {
    const dir = app('veneer', { config: format })
    const r = await check(dir)
    expect(r.diagnostics.map((d) => d.code)).toEqual(['H001'])
    expect(
      spawnSync(join(pkgs, 'core/node_modules/.bin/tsc'), ['--noEmit'], {
        cwd: dir,
        encoding: 'utf8',
      }).stdout,
    ).toBe('')
    const server = await devCommand(dir, { port: await freePort() })
    try {
      const html = await (await fetch(server.resolvedUrls.local[0])).text()
      expect(html).toMatch(/data-scope="surface"/)
      expect(html).toMatch(/<title[^>]*>App Veneer<\/title>/)
    } finally {
      await server.close()
    }
  },
)

it('the template: veneer() only for veneer, a stylesheet otherwise, and only kerf scripts', () => {
  const veneer = template({ ui: 'veneer', name: 'shop' })
  expect(veneer['kerf.config.ts']).toContain("import { veneer } from '@kerf-js/veneer/plugin'")
  expect(veneer['kerf.config.ts']).toContain('plugins: [veneer()]')
  expect(veneer['src/app.css']).toBeUndefined()
  expect(JSON.parse(veneer['package.json']!).scripts).toEqual({
    dev: 'kerf dev',
    build: 'kerf build',
    check: 'kerf check',
    typecheck: 'kerf tsc',
    start: 'kerf start',
  })
  const headless = template({ ui: 'headless' })
  expect(Object.keys(JSON.parse(headless['package.json']!).dependencies)).toEqual([
    '@kerf-js/core',
    '@kerf-js/start',
    '@kerf-js/veneer-core',
  ])
  expect(headless['src/routes/_layout.tsx']).toContain(
    "import '@kerf-js/veneer-core/styles/veneer.css'",
  )
  expect(template({ ui: 'none' })['kerf.config.ts']).not.toContain('plugins')
  expect(() => template({ ui: 'bootstrap' })).toThrow(
    '--ui must be one of veneer, headless, tailwind, none',
  )
})

describe('--db, --auth, --runtime', () => {
  const pkg = (t: Record<string, string>) => JSON.parse(t['package.json']!)

  it('--db sqlite: drizzle and one driver-free app, a generated script, no postgres', () => {
    const t = template({ ui: 'none', db: 'sqlite' })
    expect(Object.keys(pkg(t).dependencies)).toEqual(
      expect.arrayContaining(['drizzle-orm', 'drizzle-zod', 'zod']),
    )
    expect(pkg(t).dependencies.postgres).toBeUndefined()
    expect(pkg(t).scripts['db:generate']).toBe('kerf db generate')
    expect(t['src/db/index.server.ts']).toContain("from '@kerf-js/start/db/sqlite'")
    expect(t['src/db/schema.ts']).toContain('sqliteTable')
    expect(t['src/server/todos.ts']).toContain('schemasOf')
    expect(t['src/server/todos.ts']).not.toContain("auth: 'user'")
    expect(t['src/auth.server.ts']).toBeUndefined()
  })

  it('--db postgres: the postgres driver, its schema, a URL to fill in', () => {
    const t = template({ ui: 'none', db: 'postgres' })
    expect(pkg(t).dependencies.postgres).toBeDefined()
    expect(t['src/db/index.server.ts']).toContain("from '@kerf-js/start/db/postgres'")
    expect(t['src/db/schema.ts']).toContain('pgTable')
    expect(t['.env.example']).toContain('DATABASE_URL=postgres')
  })

  it('--auth: better-auth, a guard, a sign-in page, a fresh secret per scaffold', () => {
    const a = template({ ui: 'veneer', db: 'sqlite', auth: true })
    const b = template({ ui: 'veneer', db: 'sqlite', auth: true })
    const secret = (t: Record<string, string>) => /BETTER_AUTH_SECRET=(.+)/.exec(t['.env']!)![1]!
    expect(pkg(a).dependencies['better-auth']).toBeDefined()
    expect(a['src/routes/todos/_layout.tsx']).toContain("redirect('/login')")
    expect(a['src/routes/login.tsx']).toBeDefined()
    expect(a['src/server/todos.ts']).toContain("auth: 'user'")
    expect(a['src/context.server.ts']).toContain('session(auth, request)')
    expect(secret(a).length).toBeGreaterThanOrEqual(32)
    expect(secret(a)).not.toBe(secret(b))
    expect(a['.env.example']).not.toContain(secret(a))
    expect(a['.gitignore']).toMatch(/^\.env$/m)
    expect(a['.gitignore']).toMatch(/^\.data/m)
  })

  // A Boundary waits only for what its children make: the todos query belongs in a component inside it (X037).
  it.each(['veneer', 'headless', 'tailwind', 'none'])(
    '--ui %s: the todos query is made inside its Boundary',
    async (ui) => {
      const dir = app(ui, { db: 'sqlite', auth: true })
      const page = readFileSync(join(dir, 'src/routes/todos/index.tsx'), 'utf8')
      const owner = page.slice(page.indexOf('export default function Todos'))
      expect(owner).toContain('<Boundary')
      expect(owner).not.toContain('listTodos(')
      expect((await check(dir)).diagnostics.filter((d) => d.code === 'X037')).toEqual([])
    },
  )

  it.each(['bun', 'deno'])('--runtime %s lands in the config', (runtime) => {
    expect(template({ ui: 'none', runtime })['kerf.config.ts']).toContain(`runtime: '${runtime}'`)
  })

  it("refuses what can't work", () => {
    expect(() => template({ ui: 'none', db: 'mongo' })).toThrow(
      '--db must be one of sqlite, postgres, mysql, none',
    )
    expect(() => template({ ui: 'none', runtime: 'workerd' })).toThrow(
      '--runtime must be one of node, bun, deno',
    )
    expect(() => template({ ui: 'none', auth: true })).toThrow('--auth keeps users in a database')
  })
})

it('--ui tailwind writes what `kerf add tailwind` writes', async () => {
  const { cssEntry, packages, viteConfig } = await import('../../cli/src/tailwind.mjs')
  const files = template({ ui: 'tailwind' })
  expect(files['src/app.css']).toBe(cssEntry(false))
  expect(files['vite.config.ts']).toBe(viteConfig)
  expect(JSON.parse(files['package.json']!).devDependencies).toMatchObject(packages)
  expect(files['src/routes/index.tsx']).toContain('rounded-lg')
  expect(files['src/routes/_layout.tsx']).toContain('<nav class="flex gap-4 p-4">')
  expect(JSON.parse(files['package.json']!).dependencies).not.toHaveProperty('@kerf-js/veneer')
})

describe('--layer', () => {
  it.each([
    ['native', 'mysql', 'migrations/0000_todos.sql', '@kerf-js/db/plugin-native/mysql', 'mysql2'],
    ['prisma', 'mysql', 'prisma/schema.prisma', '@prisma/adapter-mariadb', '@prisma/client'],
    ['prisma', 'sqlite', 'prisma/schema.prisma', '@prisma/adapter-libsql', '@prisma/client'],
    ['drizzle', 'mysql', 'drizzle.config.ts', '@kerf-js/start/db/mysql', 'mysql2'],
  ])('%s on %s has its files, driver and plugin', (layer, db, file, entry, dep) => {
    const files = template({ db, layer })
    expect(files).toHaveProperty([file])
    expect(files['src/db/index.server.ts']).toContain(entry)
    expect(JSON.parse(files['package.json']!).dependencies).toHaveProperty([dep])
    if (layer !== 'drizzle') expect(files['kerf.config.ts']).toContain(`${layer}()`)
    else expect(files['kerf.config.ts']).not.toContain('plugin-db')
  })

  it('drizzle on MySQL never calls returning(), and Native never concatenates', () => {
    expect(template({ db: 'mysql' })['src/server/todos.ts']).not.toContain('.returning()')
    expect(template({ db: 'sqlite', layer: 'native' })['src/server/todos.ts']).not.toMatch(
      /sql\([`'"]/,
    )
  })

  it("auth on Native brings Better Auth's tables and scopes every todo query", () => {
    const files = template({ db: 'mysql', layer: 'native', auth: true })
    expect(files['migrations/0000_todos.sql']).toContain('create table `user`')
    expect(files['src/auth.server.ts']).toContain('nativeAuth(db)')
    expect(files['src/server/todos.ts']!.match(/user_id = \$\{ctx\.user\.id\}/g)).toHaveLength(3)
  })

  it('bring your own auth: the seam, no Better Auth, and a public todo app', () => {
    const files = template({ db: 'sqlite', auth: 'custom' })
    expect(files['src/auth.server.ts']).toContain('defineAuth')
    expect(files['src/context.server.ts']).toContain('session(auth, request)')
    expect(JSON.parse(files['package.json']!).dependencies).not.toHaveProperty('better-auth')
    expect(files).not.toHaveProperty(['src/routes/login.tsx'])
  })

  it('refuses an unknown layer', () => {
    expect(() => template({ db: 'sqlite', layer: 'sequel' })).toThrow('--layer must be one of')
  })
})

it('refuses a non-empty directory', () => {
  const dir = join(tmp, 'full')
  mkdirSync(dir, { recursive: true })
  rmSync(join(dir, 'x'), { force: true })
  symlinkSync(pkgs, join(dir, 'x'))
  expect(() => scaffold(dir)).toThrow('is not empty')
})
