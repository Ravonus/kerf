import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildPaths, slash } from '../src/vite/build-paths.mjs'
import {
  buildDate,
  finalizeBuild,
  normalizeAssetLookup,
  normalizeAssetManifest,
  normalizePublicAssets,
  normalizeRouting,
  normalizeServerAssets,
  stableServices,
} from '../src/vite/nitro-output.mjs'
import {
  manifestKey,
  normalizeCopiedMap,
  normalizeViteManifest,
} from '../src/vite/output-manifests.mjs'

const roots: string[] = []
async function scratch() {
  const dir = await mkdtemp(join(tmpdir(), 'kerf-nitro-output-'))
  roots.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const date = '2023-11-14T22:13:20.000Z'

describe('Nitro timestamps', () => {
  const old = '2026-11-18T11:25:32.555Z'
  const asset = (path: string) => ({ mtime: old, etag: '"content-hash"', path, size: 7 })

  it('maps an explicit epoch and rejects ambiguous or invalid values', () => {
    expect(buildDate('1700000000')).toBe(date)
    expect(buildDate('0')).toBe('1970-01-01T00:00:00.000Z')
    expect(buildDate(undefined)).toBeUndefined()
    for (const invalid of ['', ' 1', '-1', '1.2', '1e6', '9000000000000'])
      expect(() => buildDate(invalid)).toThrow('SOURCE_DATE_EPOCH')
  })

  it('finalizes the descriptor and preserves the usual bytes if the epoch is omitted', async () => {
    const dir = await scratch()
    const file = join(dir, 'nitro.json')
    const info = { preset: 'node', date: old, serverEntry: 'server/index.mjs', config: {} }
    const original = JSON.stringify(info)
    await writeFile(file, original)
    await finalizeBuild({ dir })
    expect(await readFile(file, 'utf8')).toBe(original)
    await finalizeBuild({ dir }, date)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ ...info, date })
  })

  it('sorts static assets, sets mtimes and retains content hashes and other metadata', () => {
    const a = asset('../public/a')
    const z = { ...asset('..\\public\\z.br'), encoding: 'br', data: 'aGVsbG8=' }
    const first = normalizePublicAssets(
      `export default ${JSON.stringify({ '/z': z, '/a': a })};`,
      date,
    )
    const second = normalizePublicAssets(
      `export default ${JSON.stringify({ '/a': a, '/z': z })};`,
      date,
    )
    expect(first).toBe(second)
    expect(first).toBe(
      `export default ${JSON.stringify({
        '/a': { ...a, mtime: date },
        '/z': { ...z, mtime: date, path: '../public/z.br' },
      })};`,
    )
    expect(normalizePublicAssets(`export default ${JSON.stringify({ '/a': a })};`)).toContain(old)
  })

  it('fails loudly when the static table or descriptor changes shape', async () => {
    for (const code of [
      'export const assets = {};',
      'export default load();',
      'export default { "/a": {} };',
    ])
      expect(() => normalizePublicAssets(code, date)).toThrow('unexpected module shape')
    const dir = await scratch()
    await writeFile(join(dir, 'nitro.json'), '{"created":"today"}')
    await expect(finalizeBuild({ dir }, date)).rejects.toThrow('unexpected module shape')
  })
})

describe('Nitro service and asset imports', () => {
  it('sorts asset manifest indexes while preserving dependency order and runtime callbacks', () => {
    const a = '{"js":[{"href":makeUrl("a.js")},{"href":"/first.js"}],"css":[]}'
    const z = '{"js":[],"css":[{"href":"/last.css"}]}'
    const key = (s: string) => s.replace(/^\.\.\/linked\//, 'node_modules/linked/')
    const first = `export default {"ssr":{},"client":{"../linked/z.ts":${z},"a.ts":${a}}};`
    const second = `export default {"client":{"a.ts":${a},"../linked/z.ts":${z}},"ssr":{}};`
    const expected = `export default {"client":{"a.ts":${a},"node_modules/linked/z.ts":${z}},"ssr":{}};`
    expect(normalizeAssetManifest(first, key)).toBe(expected)
    expect(normalizeAssetManifest(second, key)).toBe(expected)
    expect(() => normalizeAssetManifest('export default {"client": getMap()};', key)).toThrow(
      'unexpected module shape',
    )
    expect(() =>
      normalizeAssetManifest('export default {"client":{"a":{}, "b":{}}};', () => 'a'),
    ).toThrow('unexpected module shape')
  })

  it('uses the same name for a manifest lookup and refuses a changed lookup shape', () => {
    const head = 'import table from "virtual:fullstack/assets-manifest";'
    const source = `${head} export default table["client"]["../link/card.ts"];`
    const key = (id: string) => id.replace('../link/', 'node_modules/link/')
    expect(normalizeAssetLookup(source, key)).toBe(
      `${head} export default table["client"]["node_modules/link/card.ts"];`,
    )
    expect(() =>
      normalizeAssetLookup(`${head} export default table["client"][name];`, key),
    ).toThrow('unexpected module shape')
  })

  it('gives the generated service import the same identity at any path depth', () => {
    for (const root of ['/app/vite/services', '/a/deeper/root/vite/services'])
      expect(stableServices(`const ssr = () => import("${root}/ssr/index.js");`, root)).toBe(
        'const ssr = () => import("#kerf-built-service/ssr/index.js");',
      )
    expect(() => stableServices('import("./other.mjs");', '/app/services')).toThrow(
      'unexpected module shape',
    )
  })
})

describe('Nitro routing and bundled assets', () => {
  it('derives handler bindings from stable paths and keeps lazy and eager bindings distinct', () => {
    const module = (root: string, eager: string, lazy: string) => `
      import ${eager} from "${root}/api/fixture.mjs";
      const ${lazy} = wrap(() => import("${root}/api/fixture.mjs"));
      export const routes = [${eager}, ${lazy}];`
    const a = normalizeRouting(module('/a', '_AbC', '_lazy_Def'), buildPaths('/a'))
    const b = normalizeRouting(module('/deeper/b', '_XyZ', '_lazy_Uvw'), buildPaths('/deeper/b'))
    expect(a.replaceAll('/a/api', '/deeper/b/api')).toBe(b)
    expect(a).toMatch(/routes = \[_handler_([a-f0-9]+), _lazy_\1\]/)
  })

  it('sorts private assets and pins their metadata without changing the raw imports', () => {
    const row = (id: string) =>
      `["server:${id}"]: {import: () => import("raw:/app/assets/${id}"), meta: {"mtime":"old","etag":"hash"}}`
    const a = row('a')
    const z = row('z')
    expect(normalizeServerAssets(`const _assets = {${z},${a}};`, date)).toBe(
      `const _assets = {${a},${z}};`.replaceAll('"old"', JSON.stringify(date)),
    )
  })
})

describe('build file identifiers', () => {
  it('uses the app root, the linked package name and the pinned install slot', async () => {
    const dir = await scratch()
    const app = join(dir, 'deep/app')
    const library = join(dir, 'outside/library')
    await mkdir(library, { recursive: true })
    await writeFile(join(library, 'package.json'), '{"name":"@scope/library"}')
    const paths = buildPaths(app)
    expect(paths(join(app, 'src/routes/x.tsx?kerf-assets'))).toBe('src/routes/x.tsx?kerf-assets')
    expect(paths(join(library, 'src/x.tsx'))).toBe('node_modules/@scope/library/src/x.tsx')
    const pin = 'node_modules/.pnpm/library@2/node_modules/library/index.js'
    expect(paths(join(dir, pin))).toBe(pin)
    expect(manifestKey(paths, '../../../root/\0virtual:kerf/entry-client')).toBe(
      'virtual:kerf/entry-client',
    )
    expect(paths('../../../root/\0rolldown/runtime.js')).toBe('rolldown/runtime.js')
    expect(manifestKey(paths, '../../../root/rolldown/runtime.js')).toBe('rolldown/runtime.js')
    expect(slash('src\\routes\\x.tsx')).toBe('src/routes/x.tsx')
  })

  it('sorts Vite manifest keys and relabels matching source and import identifiers', () => {
    const key = (path: string) => path.replace('../kit/', 'node_modules/kit/')
    const source = {
      'src/index.ts': { imports: ['../kit/z.js', '../kit/a.js'], dynamicImports: ['../kit/z.js'] },
      '../kit/z.js': { src: '../kit/z.js', file: 'assets/z.js' },
      '../kit/a.js': ['/assets/z.js', '/assets/a.js'],
    }
    const result = normalizeViteManifest(JSON.stringify(source), key)
    expect(Object.keys(JSON.parse(result))).toEqual([
      'node_modules/kit/a.js',
      'node_modules/kit/z.js',
      'src/index.ts',
    ])
    expect(JSON.parse(result)).toMatchObject({
      'node_modules/kit/a.js': ['/assets/z.js', '/assets/a.js'],
      'node_modules/kit/z.js': { src: 'node_modules/kit/z.js', file: 'assets/z.js' },
      'src/index.ts': {
        imports: ['node_modules/kit/z.js', 'node_modules/kit/a.js'],
        dynamicImports: ['node_modules/kit/z.js'],
      },
    })
  })

  it('relabels copied maps while preserving the source index and mappings', () => {
    const app = join(tmpdir(), 'app')
    const file = join(app, '.nitro/services/ssr/assets/ssr.js.map')
    const map = {
      version: 3,
      sources: ['../../../../src/b.ts', 'virtual:kerf/app', '../../../../src/a.ts'],
      mappings: 'AAAA,CCAA',
      names: ['a', 'b'],
      sourcesContent: ['b', 'generated physical imports', 'a'],
      ignoreList: [1],
    }
    expect(
      JSON.parse(
        normalizeCopiedMap(JSON.stringify(map), (path) => slash(relative(app, path)), file),
      ),
    ).toEqual({
      version: 3,
      sources: ['src/b.ts', 'virtual:kerf/app', 'src/a.ts'],
      mappings: map.mappings,
      names: map.names,
      ignoreList: [1],
    })
  })
})
