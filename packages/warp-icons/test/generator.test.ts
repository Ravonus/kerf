// @vitest-environment node
// Generated modules must remain complete and checked against their artwork.
import { repoRoot } from '../../../scripts/lib/helpers.mjs'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { outputs } from '../scripts/build.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const repo = repoRoot

function check(dir: string) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [join(dir, 'scripts/build.mjs'), '--check'], {
    cwd: dir,
    env,
    encoding: 'utf8',
  })
}

test('icon declarations match the independent pre-split artwork reference', async () => {
  const files = await outputs()
  const declarations = Object.entries(files)
    .filter(([name]) => /^all-.*\.tsx$/.test(name))
    .flatMap(([, text]) =>
      text.split('\n').filter((line) => /^export (const |\{ (?!iconSet))/.test(line)),
    )
  const digest = (lines: string[]) => createHash('sha256').update(lines.join('\n')).digest('hex')
  const reference = 'd6704260e9fc91481aa63f33615e5874d647b198c87fda1d9bd7dbda5fb76080'
  expect(declarations.filter((line) => /^export const .*?Icon =/.test(line))).toHaveLength(651)
  expect(declarations).toHaveLength(1958)
  expect(digest(declarations)).toBe(reference)
  expect(digest([...declarations, 'changed'])).not.toBe(reference)
})

test('generated file inventory agrees with the tracked files', async () => {
  const expected = Object.keys(await outputs()).sort()
  const tracked = execFileSync('git', ['ls-files', 'packages/warp-icons/src/gen'], {
    cwd: repo,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .map((p) => p.slice('packages/warp-icons/src/gen/'.length))
    .sort()
  expect(tracked).toEqual(expected)
  expect([...tracked, 'all-orphan.tsx'].sort()).not.toEqual(expected)
})

test('the generator check rejects every missing and stale icon module', async () => {
  const files = Object.keys(await outputs()).filter((name) => /^all-.*\.tsx$/.test(name))
  expect(files).toHaveLength(7)
  const dir = mkdtempSync(join(tmpdir(), 'weft-icon-check-'))
  try {
    for (const path of ['art', 'scripts', 'src/gen'])
      cpSync(join(root, path), join(dir, path), { recursive: true })
    expect(check(dir).status).toBe(0)
    for (const file of files) {
      const path = join(dir, 'src/gen', file)
      const original = readFileSync(path)
      rmSync(path)
      const missing = check(dir)
      expect(missing.status).toBe(1)
      expect(missing.stderr).toContain(file)
      writeFileSync(path, Buffer.concat([original, Buffer.from('\n')]))
      const stale = check(dir)
      expect(stale.status).toBe(1)
      expect(stale.stderr).toContain(file)
      writeFileSync(path, original)
    }
    expect(check(dir).status).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 60000)

test('pack cost covers every generated drawing in canonical order', async () => {
  const { packCost } = await import('../compile.mjs')
  expect(packCost()).toBe(166909)
})

test('pack cost reads changed and missing graph modules on every call', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-icon-cost-'))
  try {
    cpSync(join(root, 'src/gen'), join(dir, 'gen'), { recursive: true })
    cpSync(join(root, 'src/compile-catalog.mjs'), join(dir, 'compile-catalog.mjs'))
    const { packCost } = await import(pathToFileURL(join(dir, 'compile-catalog.mjs')).href)
    const baseline = packCost()
    expect(baseline).toBe(166909)
    const file = join(dir, 'gen/all-cake-cursor.tsx')
    writeFileSync(file, readFileSync(file, 'utf8') + '\n' + 'changed '.repeat(1000))
    expect(packCost()).not.toBe(baseline)
    rmSync(file)
    expect(() => packCost()).toThrow()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the Vite icon transform covers generated modules only', async () => {
  const { icons } = await import('../../core/vite/icons.mjs')
  const plugins = icons()
  const plugin = plugins.rewrite
  const dir = mkdtempSync(join(tmpdir(), 'weft-icon-scope-'))
  try {
    plugin.configResolved({ root: dir, command: 'build' })
    const context = { resolve: () => Promise.resolve({ id: join(root, 'compile.mjs') }) }
    const handler = plugin.transform.handler.bind(context)
    const group = readFileSync(join(root, 'src/gen/all-cake-cursor.tsx'), 'utf8')
    const entry = readFileSync(join(root, 'src/gen/all.tsx'), 'utf8')
    expect(plugin.transform.filter.code.test(entry)).toBe(true)
    for (const id of [
      '/project/node_modules/@weft-js/warp-icons/src/gen/all-cake-cursor.tsx?weft-ssr',
      'C:\\project\\node_modules\\@weft-js\\warp-icons\\src\\gen\\all-cake-cursor.tsx?weft-hydrate',
    ]) {
      const transformed = await handler(group, id)
      expect(transformed).toContain('\\u0000weft:icon/')
      expect(transformed).not.toContain('data-t=')
      const virtual = await plugins.resolve.load.handler('\0weft:icon/CakeIcon')
      expect(virtual.code).toContain('data-bi=')
      expect(virtual.code).not.toContain('data-qs=')
      expect(virtual.code).not.toContain('data-t=')
    }
    mkdirSync(join(dir, '.weft/tokens'), { recursive: true })
    writeFileSync(
      join(dir, '.weft/tokens/icons.alias.json'),
      JSON.stringify({ '@weft-js/warp-icons': '@weft-js/warp-icons/vivid' }),
    )
    plugin.configResolved({ root: dir, command: 'build' })
    await handler(group, '/project/node_modules/@weft-js/warp-icons/src/gen/all-cake-cursor.tsx')
    const vivid = await plugins.resolve.load.handler('\0weft:icon/CakeIcon')
    expect(vivid.code).toContain('data-p=')
    expect(vivid.code).not.toContain('data-bi=')
    const moduleId = '\0weft:icon/TestIcon'
    const sampleId = '/project/node_modules/@weft-js/warp-icons/src/gen/all-test.tsx'
    const drawing = (shape: string) => `export const TestIcon = /*#__PURE__*/ icon('${shape}')`
    await handler(drawing('first'), sampleId)
    expect((await plugins.resolve.load.handler(moduleId)).code).toContain('first')
    await handler(drawing('second'), sampleId)
    expect((await plugins.resolve.load.handler(moduleId)).code).toContain('second')
    expect((await plugins.resolve.load.handler(moduleId)).code).not.toContain('first')
    for (const id of [
      '/project/unrelated/src/gen/all-cake-cursor.tsx',
      '/project/not-warp-icons/src/gen/all-cake-cursor.tsx?x',
    ])
      expect(await handler(group, id)).toBeNull()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
