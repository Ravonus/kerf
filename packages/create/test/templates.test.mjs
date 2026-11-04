// `--template`: a real app laid over the scaffold. The templates written so far are each checked as an app; what they all
// have to hold (a theme, their pages, migrations in step with the schema) is checked on every one.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { check } from '../../cli/src/check.mjs'
import { scaffold, template, TEMPLATES } from '../src/index.mjs'
import { resolveChoices } from '../src/wizard.mjs'
import { idempotent, loadTemplate, withTemplate } from '../src/templates.mjs'

const ts = createRequire(new URL('../../cli/package.json', import.meta.url))('typescript')
const here = new URL('../', import.meta.url)
const tmp = fileURLToPath(new URL('./.tmp-templates/', import.meta.url))
const pkgs = fileURLToPath(new URL('../../', import.meta.url))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

// The package a scoped name is, by its directory: most drop the scope, a few kept their old directory names.
const home = (dep) =>
  join(
    pkgs,
    { '@weft-js/core': 'weft', '@weft-js/create': 'create-weft', '@weft-js/warp-icons': 'icons' }[
      dep
    ] ?? dep.replace('@weft-js/', ''),
  )

const written = TEMPLATES.filter((name) =>
  existsSync(new URL(`templates/${name}/template.json`, here)),
)

function literal(node) {
  if (ts.isStringLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties.map((p) => {
        expect(ts.isPropertyAssignment(p)).toBe(true)
        return [p.name.text, literal(p.initializer)]
      }),
    )
  throw new Error(`Unexpected warp option: ${node.getText()}`)
}

function app(name, options = {}) {
  const dir = join(tmp, `${name}-${options.config ?? 'ts'}`)
  rmSync(dir, { recursive: true, force: true })
  scaffold(dir, { template: name, ...options })
  const deps = Object.keys({
    ...JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies,
    '@weft-js/cli': 1,
  })
  for (const dep of deps.filter((d) => d.startsWith('@weft-js/'))) {
    mkdirSync(join(dir, 'node_modules', '@weft-js'), { recursive: true })
    symlinkSync(home(dep), join(dir, 'node_modules', dep), 'dir')
  }
  // A link resolves from where it points, and a package whose own install has no `@weft-js/core` can't reach its peer from
  // there, so it's copied in to resolve the app's.
  for (const dep of deps.filter((d) => d.startsWith('@weft-js/') && d !== '@weft-js/core')) {
    if (existsSync(join(home(dep), 'node_modules', '@weft-js', 'core'))) continue
    rmSync(join(dir, 'node_modules', dep))
    cpSync(home(dep), join(dir, 'node_modules', dep), { recursive: true })
  }
  return dir
}

describe.each(written)('--template %s', (name) => {
  const t = loadTemplate(name)

  it('holds what every template has to', () => {
    expect(t.files['src/routes/_layout.tsx']).toContain("import '../theme.css'")
    expect(t.pages.length).toBeGreaterThan(0)
    const routes = Object.keys(t.files)
      .filter((f) => f.startsWith('src/routes/'))
      .map(
        (f) =>
          f
            .replace(/^src\/routes/, '')
            .replace(/\.tsx$/, '')
            .replace(/\/index$/, '')
            .replace(/\[(\w+)\]/g, ':$1') || '/',
      )
    for (const page of t.pages) expect(routes).toContain(page.replace(/\[(\w+)\]/g, ':$1'))
  })

  it('ships migrations in step with its schema, safe over existing tables', () => {
    if (t.requires.db === 'none') return
    expect(t.files['drizzle/.schema-hash'].trim()).toBe(
      createHash('sha256').update(t.files['src/db/schema.ts']).digest('hex').slice(0, 16),
    )
    const sql = Object.entries(t.files)
      .filter(([f]) => /^drizzle\/\w+\.sql$/.test(f))
      .map(([, text]) => text)
    expect(sql.length).toBeGreaterThan(0)
    for (const text of sql) expect(idempotent(text)).toBe(text)
  })

  // tsc, a build and the served app need the template's database packages installed: scripts/packed.mjs has those.
  // Without them the routes don't load, and H016 says their source was checked instead. weft's own packages are linked,
  // so one of those not resolving is a fault here, not a missing install.
  it('weft check is clean', async () => {
    const uninstalled = (d) => d.code === 'H016' && d.route === '*' && !d.why.includes('@weft-js/')
    expect((await check(app(name))).diagnostics.filter((d) => !uninstalled(d))).toEqual([])
  })

  it.each(['json', 'yaml'])(
    'refuses a %s config, which has no place for its plugin options',
    (format) => {
      expect(() => withTemplate({ template: name, config: format })).toThrow(`needs --config ts`)
      expect(withTemplate({ template: name }).config).toBe('ts')
    },
  )
})

describe('the overlay', () => {
  const files = template({ template: 'landing', name: 'launch' })
  const pkg = JSON.parse(files['package.json'])

  it('implies what the template requires, with postgres as the database', () => {
    expect(pkg.dependencies.postgres).toBeDefined()
    expect(pkg.dependencies['@weft-js/warp']).toBeDefined()
    expect(pkg.dependencies['better-auth']).toBeUndefined()
    expect(files['src/db/index.server.ts']).toContain("from '@weft-js/start/db/postgres'")
    expect(files['.env']).toContain('DATABASE_URL=postgres://localhost:5432/launch')
  })

  it("leaves the default scaffold's todo app out", () => {
    for (const file of [
      'src/routes/about.tsx',
      'src/routes/todos/index.tsx',
      'src/server/todos.ts',
    ])
      expect(files).not.toHaveProperty([file])
    expect(files['src/db/schema.ts']).not.toContain('todos')
  })

  it("puts the template's warp options in the config", () => {
    const source = ts.createSourceFile(
      'weft.config.ts',
      files['weft.config.ts'],
      ts.ScriptTarget.Latest,
    )
    const calls = []
    const visit = (node) => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'warp') calls.push(node)
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(calls).toHaveLength(1)
    expect(calls[0].arguments).toHaveLength(1)
    expect(literal(calls[0].arguments[0])).toEqual(loadTemplate('landing').warp)
  })

  it('the default stays what it was without a template', () => {
    expect(withTemplate({ db: undefined })).toEqual({ db: undefined })
    expect(template({ db: 'sqlite' })['src/routes/todos/index.tsx']).toContain('listTodos')
  })

  it('the wizard asks nothing the template settled, and takes its auth over the default', async () => {
    const choices = await resolveChoices(withTemplate({ template: 'landing' }), {
      interactive: false,
      yes: true,
    })
    expect(choices).toMatchObject({
      template: 'landing',
      ui: 'warp',
      db: 'postgres',
      layer: 'drizzle',
      auth: false,
    })
  })

  it("refuses what the template can't work with", () => {
    expect(() => template({ template: 'blog' })).toThrow(
      '--template must be one of landing, todo, admin, catalog',
    )
    expect(() => template({ template: 'landing', ui: 'tailwind' })).toThrow('needs --ui warp')
    expect(() => template({ template: 'landing', db: 'sqlite' })).toThrow('needs --db postgres')
    expect(() => template({ template: 'landing', layer: 'prisma' })).toThrow(
      'needs --layer drizzle',
    )
    expect(() => template({ template: 'landing', auth: true })).toThrow('needs sign-in off')
  })
})

it('every scaffold gets a short AGENTS.md', () => {
  const plain = template({ ui: 'warp', db: 'sqlite' })['AGENTS.md']
  expect(plain).toContain('npx weft check --json')
  expect(plain).toContain('npx weft db generate')
  expect(plain).toContain('warp({ seed')
  const shipped = template({ template: 'landing' })['AGENTS.md']
  expect(shipped).toContain('`src/theme.css`')
  expect(shipped).toContain('`drizzle/` applies on the first request')
  expect(shipped).not.toContain('before the first run')
  expect(Buffer.byteLength(shipped)).toBeLessThan(2048)
})

it('idempotent() guards every statement drizzle-kit writes', () => {
  const sql = idempotent(
    `CREATE TABLE "todos" (\n\t"id" uuid PRIMARY KEY\n);\n--> statement-breakpoint\nALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;\n--> statement-breakpoint\nCREATE INDEX "todos_user" ON "todos" USING btree ("user_id");\nCREATE UNIQUE INDEX "x" ON "todos" USING btree ("id");`,
  )
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS "todos"')
  expect(sql).toContain('CREATE INDEX IF NOT EXISTS "todos_user"')
  expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "x"')
  expect(sql).toMatch(
    /IF NOT EXISTS \(SELECT 1 FROM pg_constraint[^;]*'"todos"'::regclass[^;]*a\.attname = 'user_id'\) THEN\n\s+ALTER TABLE "todos" ADD CONSTRAINT/,
  )
  expect(sql.split('--> statement-breakpoint')).toHaveLength(3)
  expect(idempotent(sql)).toBe(sql)
})

it('the bin takes --template, and the tarball carries templates/', () => {
  const dir = join(tmp, 'bin')
  const r = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('bin/create-weft.mjs', here)),
      dir,
      '--template',
      'landing',
      '--yes',
      '--no-install',
      '--no-git',
    ],
    { encoding: 'utf8' },
  )
  expect(r.stderr).toBe('')
  expect(r.stdout).not.toContain('weft db generate')
  expect(readdirSync(join(dir, 'drizzle'))).toEqual(
    expect.arrayContaining(['.schema-hash', '0000_landing.sql', 'meta']),
  )
  const packed = JSON.parse(
    spawnSync('pnpm', ['pack', '--dry-run', '--json'], {
      cwd: fileURLToPath(here),
      encoding: 'utf8',
    }).stdout,
  ).files.map((f) => f.path)
  expect(packed).toEqual(
    expect.arrayContaining([
      'templates/landing/template.json',
      'templates/landing/files/src/theme.css',
      'templates/landing/files/drizzle/.schema-hash',
      'templates/landing/files/drizzle/meta/_journal.json',
    ]),
  )
  expect(packed).not.toContain('test/scaffold.test.mjs')
})
