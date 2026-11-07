import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { assetBytes } from '../../src/vite/asset-bytes.mjs'
import { renderChunk, writeBundle } from '../../src/vite/config-hooks.mjs'
import { matchingRouteAssets, selectRouteAssets } from '../../src/asset-receipt.mjs'
import { ROUTE_ASSET_BYTES } from '../../src/vite/shared.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'weft-emitted-bytes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const chunk = (code, modules, imports = [], css = [], assets = []) => ({
    type: 'chunk',
    code,
    modules: Object.fromEntries(modules.map((id) => [id, {}])),
    imports,
    viteMetadata: { importedCss: new Set(css), importedAssets: new Set(assets) },
  })
  const bundle = {
    'a.js': chunk('á', ['/app/a.tsx'], ['shared.js'], ['a.css'], ['icon.svg']),
    'b.js': chunk('bbb', ['/app/b.tsx?weft-assets'], ['shared.js'], ['b.css'], ['icon.svg']),
    'shared.js': chunk('shared', ['/app/shared.ts'], [], ['shared.css']),
    'eager.js': chunk('shapes', ['\0virtual:weft/routes'], ['shared.js']),
    'a.css': { type: 'asset', source: '€' },
    'b.css': { type: 'asset', source: 'bb' },
    'shared.css': { type: 'asset', source: 'c' },
    'icon.svg': { type: 'asset', source: '🔥' },
  }
  for (const [name, item] of Object.entries(bundle))
    writeFileSync(join(root, name), item.type === 'chunk' ? item.code : item.source)
  const manifest = {
    layouts: [],
    routes: [
      { id: '/a', file: 'a.tsx' },
      { id: '/b', file: 'b.tsx' },
      { id: '/missing', file: 'missing.tsx' },
    ],
  }
  const abs = (file) => `/app/${file}`
  return { root, bundle, manifest, abs }
}

test('emitted bytes preserve shared graph ownership and UTF-8 lengths', (t) => {
  const f = fixture(t)
  const result = assetBytes(f.bundle, (file) => readFileSync(join(f.root, file)), f.manifest, f.abs)
  assert.equal(result.files['a.js'].bytes, 2)
  assert.equal(result.files['a.css'].bytes, 3)
  assert.equal(result.files['icon.svg'].bytes, 4)
  assert.equal(result.files['icon.svg'].kind, 'asset')
  assert.deepEqual(result.shared, ['icon.svg', 'shared.css', 'shared.js'])
  assert.deepEqual(result.routes['/a'], {
    files: ['a.css', 'a.js', 'icon.svg', 'shared.css', 'shared.js'],
    bytes: 16,
    uniqueBytes: 5,
    sharedBytes: 11,
  })
  assert.equal(result.routes['/b'].bytes, 16)
  assert.equal(result.routes['/missing'], null)
  assert.equal(result.eager.bytes, 13)
  assert.equal(result.scope, 'vite-static-closure')
  rmSync(join(f.root, 'shared.css'))
  const missing = assetBytes(
    f.bundle,
    (file) => readFileSync(join(f.root, file)),
    f.manifest,
    f.abs,
  )
  assert.equal(missing.files['shared.css'].bytes, null)
  assert.equal(missing.routes['/a'].bytes, null)
  assert.equal(missing.eager.sharedBytes, null)
})

test('unknown graph metadata and external imports do not become zero cost', (t) => {
  const f = fixture(t)
  delete f.bundle['a.js'].viteMetadata
  f.bundle['b.js'].imports.push('external-package')
  const result = assetBytes(f.bundle, (file) => readFileSync(join(f.root, file)), f.manifest, f.abs)
  assert.equal(result.routes['/a'].bytes, null)
  assert.equal(result.routes['/b'].bytes, null)
  assert.equal(result.files['external-package'].bytes, null)
  assert.equal(result.files['external-package'].kind, 'unknown')
  f.bundle['shared.js'].modules['/app/a.tsx'] = {}
  const ambiguous = assetBytes(f.bundle, () => Buffer.from(''), f.manifest, f.abs)
  assert.equal(ambiguous.routes['/a'], null)
})

test('client writeBundle emits the byte manifest independent of CSS options', async (t) => {
  const f = fixture(t)
  const state = {
    dev: false,
    build: 'build-a',
    options: { site: { criticalCss: false } },
    manifest: f.manifest,
    abs: f.abs,
  }
  const context = { environment: { config: { consumer: 'client' } } }
  await writeBundle(state).handler.call(context, { dir: f.root }, f.bundle)
  const saved = JSON.parse(readFileSync(join(f.root, 'weft-route-assets.json'), 'utf8'))
  assert.equal(saved.routes['/a'].bytes, 16)
  assert.equal(saved.build, 'build-a')
  assert.equal(saved.eager.bytes, 13)
  assert.equal(state.routeAssetBytes.routes['/b'].bytes, 16)
  const collision = { ...f.bundle, 'weft-route-assets.json': { type: 'asset', source: '{}' } }
  await assert.rejects(
    () => writeBundle(state).handler.call(context, { dir: f.root }, collision),
    /Cannot overwrite/,
  )
})

test('emitted byte reads stay inside the output directory and preserve binary bytes', async (t) => {
  const f = fixture(t)
  const outside = join(dirname(f.root), `${basename(f.root)}-outside.bin`)
  const outsideDir = `${outside}-dir`
  t.after(() => rmSync(outside, { force: true }))
  t.after(() => rmSync(outsideDir, { recursive: true, force: true }))
  writeFileSync(outside, Buffer.from([0, 255, 128, 42, 9]))
  mkdirSync(outsideDir)
  writeFileSync(join(outsideDir, 'nested.bin'), Buffer.from([0, 255, 128]))
  writeFileSync(join(f.root, 'binary.bin'), Buffer.from([0, 255, 128, 42]))
  symlinkSync(outside, join(f.root, 'linked.bin'))
  symlinkSync(outsideDir, join(f.root, 'escaped-dir'))
  symlinkSync(join(f.root, 'binary.bin'), join(f.root, 'inside.bin'))
  mkdirSync(join(f.root, 'C:'))
  writeFileSync(join(f.root, 'C:', 'binary.bin'), Buffer.from([1]))
  writeFileSync(join(f.root, '..\\binary.bin'), Buffer.from([1]))
  const traversal = `../${basename(outside)}`
  const mirrored = join(f.root, outside)
  mkdirSync(dirname(mirrored), { recursive: true })
  writeFileSync(mirrored, Buffer.from([1, 2, 3]))
  for (const name of [
    traversal,
    outside,
    'linked.bin',
    'escaped-dir/nested.bin',
    'C:/binary.bin',
    '..\\binary.bin',
    'binary.bin',
    'inside.bin',
  ]) {
    f.bundle[name] = { type: 'asset', source: Buffer.from([1]) }
    f.bundle['a.js'].viteMetadata.importedAssets.add(name)
  }
  const state = {
    dev: false,
    build: 'build-a',
    options: { site: { criticalCss: false } },
    manifest: f.manifest,
    abs: f.abs,
  }
  const context = { environment: { config: { consumer: 'client' } } }
  await writeBundle(state).handler.call(context, { dir: f.root }, f.bundle)
  const receipt = JSON.parse(readFileSync(join(f.root, 'weft-route-assets.json'), 'utf8'))
  const unsafe = [
    traversal,
    outside,
    'linked.bin',
    'escaped-dir/nested.bin',
    'C:/binary.bin',
    '..\\binary.bin',
  ]
  assert.deepEqual(
    unsafe.map((name) => receipt.files[name].bytes),
    unsafe.map(() => null),
  )
  assert.equal(receipt.files['binary.bin'].bytes, 4)
  assert.equal(receipt.files['inside.bin'].bytes, 4)
  assert.equal(receipt.routes['/a'].bytes, null)
})

test('same-build receipt selects levels and deduplicates their emitted files', (t) => {
  const f = fixture(t)
  const receipt = {
    ...assetBytes(f.bundle, (file) => readFileSync(join(f.root, file)), f.manifest, f.abs),
    build: 'build-a',
  }
  const selected = selectRouteAssets(receipt, 'build-a', ['/a', '/b'])
  assert.deepEqual(selected.levels, [
    { id: '/a', bytes: 16 },
    { id: '/b', bytes: 16 },
  ])
  assert.equal(selected.routeBytes, 21)
  assert.equal(selected.eagerBytes, 13)
  assert.equal(selected.combinedBytes, 27)
  assert.equal(matchingRouteAssets(selected, 'build-a'), selected)
  assert.equal(matchingRouteAssets(selected, 'old-client'), null)
  assert.equal(matchingRouteAssets(selected, undefined), null)
  assert.equal(selectRouteAssets(receipt, 'other-build', ['/a']), null)
  assert.equal(selectRouteAssets(receipt, undefined, ['/a']), null)
  assert.equal(selectRouteAssets(null, 'build-a', ['/a']), null)
  assert.equal(selectRouteAssets(receipt, 'build-a', ['/missing']).routeBytes, null)
  assert.equal(selectRouteAssets(receipt, 'build-a', ['/missing']).combinedBytes, null)
  receipt.files['icon.svg'].bytes = null
  assert.equal(selectRouteAssets(receipt, 'build-a', ['/a']).routeBytes, null)
})

test('server chunk embeds only a same-build emitted receipt', async (t) => {
  const f = fixture(t)
  const state = {
    root: f.root,
    dev: false,
    build: 'build-a',
    options: { site: { criticalCss: false } },
    manifest: f.manifest,
    abs: f.abs,
  }
  const client = { environment: { config: { consumer: 'client' } } }
  await writeBundle(state).handler.call(client, { dir: f.root }, f.bundle)
  const context = {
    environment: {
      getTopLevelConfig: () => ({
        environments: { client: { build: { outDir: f.root } } },
      }),
    },
  }
  const input = `const receipt = '${ROUTE_ASSET_BYTES}'`
  const emitted = renderChunk(state).handler.call(context, input).code
  assert.ok(emitted.includes('"build":"build-a"'))
  assert.ok(!emitted.includes(ROUTE_ASSET_BYTES))
  state.build = 'build-b'
  assert.equal(renderChunk(state).handler.call(context, input).code, 'const receipt = null')
  rmSync(join(f.root, 'weft-route-assets.json'))
  assert.equal(renderChunk(state).handler.call(context, input).code, 'const receipt = null')
})
