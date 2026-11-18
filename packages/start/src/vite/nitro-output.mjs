// Normalize Nitro's generated modules before bundling so the normalized data also
// controls the hashes, and finish the build descriptor after Nitro writes it.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { parseAst } from 'vite'
import { buildPaths, slash } from './build-paths.mjs'
import { normalizeCopiedMap, sourceMapOptions } from './output-manifests.mjs'

const publicAssets = '#nitro/virtual/public-assets-data'
const serverAssets = '#nitro/virtual/server-assets'
const viteServices = '#nitro/virtual/vite-services'
const assetManifest = '__fullstack_assets_manifest.js'
const assetImport = 'virtual:fullstack/assets-manifest'
const servicePrefix = '#kerf-built-service/'

const byKey = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
const sorted = (entries) => Object.fromEntries([...entries].sort(byKey))
const fail = (name) =>
  new Error(`Kerf could not normalize Nitro's ${name}: unexpected module shape`)

function defaultExport(code, name) {
  const { body } = parseAst(code)
  if (body.length !== 1 || body[0].type !== 'ExportDefaultDeclaration') throw fail(name)
  return body[0].declaration
}

/** SOURCE_DATE_EPOCH is an integer count of seconds since the Unix epoch. */
export function buildDate(value) {
  if (value === undefined) return undefined
  const millis = Number(value) * 1000
  if (!/^\d+$/.test(value) || millis > 8.64e15)
    throw new Error('SOURCE_DATE_EPOCH must be a non-negative Unix timestamp in seconds')
  return new Date(millis).toISOString()
}

/** Normalize the JSON-only module produced for Nitro's static middleware. */
export function normalizePublicAssets(code, date) {
  const node = defaultExport(code, publicAssets)
  if (node.type !== 'ObjectExpression') throw fail(publicAssets)
  let data
  try {
    data = JSON.parse(code.slice(node.start, node.end))
  } catch {
    throw fail(publicAssets)
  }
  for (const [id, asset] of Object.entries(data)) {
    if (
      !id.startsWith('/') ||
      typeof asset?.etag !== 'string' ||
      typeof asset?.mtime !== 'string' ||
      typeof asset?.path !== 'string' ||
      typeof asset?.size !== 'number'
    )
      throw fail(publicAssets)
    asset.mtime = date ?? asset.mtime
    asset.path = slash(asset.path)
  }
  return `export default ${JSON.stringify(sorted(Object.entries(data)))};`
}

function assetProperties(node) {
  if (node.type !== 'ObjectExpression') throw fail(assetManifest)
  return node.properties.map((p) => {
    if (p.type !== 'Property' || p.computed || typeof p.key.value !== 'string')
      throw fail(assetManifest)
    return [p.key.value, p.value]
  })
}

/** Sort the two manifest indexes and keep the values, including runtime URL expressions. */
export function normalizeAssetManifest(code, keyFor) {
  const entries = assetProperties(defaultExport(code, assetManifest))
  const object = (fields) =>
    `{${[...fields]
      .sort(byKey)
      .map(([key, value]) => `${JSON.stringify(key)}:${value}`)
      .join(',')}}`
  const environment = (table) => {
    const files = assetProperties(table).map(([key, value]) => [
      keyFor(key),
      code.slice(value.start, value.end),
    ])
    if (new Set(files.map(([key]) => key)).size !== files.length) throw fail(assetManifest)
    return object(files)
  }
  return `export default ${object(entries.map(([key, table]) => [key, environment(table)]))};`
}

/** Normalize the matching lookup while Nitro's generated asset proxy is still its own module. */
export function normalizeAssetLookup(code, keyFor) {
  const { body } = parseAst(code)
  const imported = body.find(
    (statement) => statement.type === 'ImportDeclaration' && statement.source.value === assetImport,
  )
  const name = imported?.specifiers[0]?.local.name
  if (!name) throw fail('Vite asset lookup')
  let count = 0
  const visit = (node) => {
    if (
      node.type === 'MemberExpression' &&
      node.object.type === 'MemberExpression' &&
      node.object.object.name === name
    ) {
      const key = node.property
      if (!node.computed || typeof key.value !== 'string') throw fail('Vite asset lookup')
      count++
      return [key.start, key.end, JSON.stringify(keyFor(key.value))]
    }
  }
  const edits = collectEdits({ body }, visit)
  if (!count) throw fail('Vite asset lookup')
  return editCode(code, edits)
}

function collectEdits(tree, replacement) {
  const edits = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    const edit = replacement(node)
    if (edit !== undefined) {
      edits.push(edit)
      return
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk)
      else walk(value)
    }
  }
  walk(tree)
  return edits
}

function editCode(code, edits) {
  for (const [start, end, text] of edits.sort(([a], [b]) => b - a))
    code = code.slice(0, start) + text + code.slice(end)
  return code
}

/** Give the generated service imports a stable specifier before mapping their source columns. */
export function stableServices(code, directory) {
  const edits = collectEdits(parseAst(code), (node) => {
    if (node.type !== 'ImportExpression') return
    const source = slash(node.source.value ?? '')
    if (!source.startsWith(directory + '/')) throw fail(viteServices)
    const specifier = servicePrefix + source.slice(directory.length + 1)
    return [node.source.start, node.source.end, JSON.stringify(specifier)]
  })
  return editCode(code, edits)
}

/** Nitro hashes the physical handler import, including its own runtime and app routes. */
export function normalizeRouting(code, pathFor) {
  const tree = parseAst(code)
  const names = new Map()
  const record = (node, source) => {
    if (!node?.name.startsWith('_') || typeof source !== 'string') return
    const hash = createHash('sha256').update(pathFor(source)).digest('hex').slice(0, 16)
    const kind = node.name.startsWith('_lazy_') ? '_lazy_' : '_handler_'
    names.set(node.name, `${kind}${hash}${node.name.endsWith('Meta') ? 'Meta' : ''}`)
  }
  collectEdits(tree, (node) => {
    if (node.type === 'ImportDeclaration') record(node.specifiers[0]?.local, node.source.value)
    if (node.type === 'VariableDeclarator' && node.id.name?.startsWith('_lazy_')) {
      const imports = collectEdits(node.init, (child) =>
        child.type === 'ImportExpression' ? child.source.value : undefined,
      )
      if (imports.length !== 1) throw fail('routing')
      record(node.id, imports[0])
    }
  })
  const edits = collectEdits(tree, (node) => {
    if (node.type === 'Identifier' && names.has(node.name))
      return [node.start, node.end, names.get(node.name)]
  })
  return editCode(code, edits)
}

/** Normalize Nitro's private asset index without changing its bundled raw imports. */
export function normalizeServerAssets(code, date) {
  const { body } = parseAst(code)
  const table = body
    .filter((node) => node.type === 'VariableDeclaration')
    .flatMap((node) => node.declarations)
    .find((node) => node.id.name === '_assets')?.init
  if (table?.type !== 'ObjectExpression') throw fail(serverAssets)
  const entries = table.properties.map((record) => {
    if (typeof record.key?.value !== 'string' || record.value.type !== 'ObjectExpression')
      throw fail(serverAssets)
    const meta = record.value.properties.find((p) => p.key?.name === 'meta')?.value
    if (!meta) throw fail(serverAssets)
    const info = JSON.parse(code.slice(meta.start, meta.end))
    if (typeof info.mtime !== 'string') throw fail(serverAssets)
    return [
      record.key.value,
      code.slice(record.start, meta.start) +
        JSON.stringify({ ...info, mtime: date ?? info.mtime }) +
        code.slice(meta.end, record.end),
    ]
  })
  return editCode(code, [
    [
      table.start,
      table.end,
      `{${entries
        .sort(byKey)
        .map(([, value]) => value)
        .join(',')}}`,
    ],
  ])
}

/** Scope the adapters to Nitro's generated modules and resolve service paths only inside the build. */
export function nitroOutput({ options }, date) {
  const services = slash(join(options.buildDir, 'vite/services'))
  const pathFor = buildPaths(options.rootDir)
  return {
    name: 'kerf:start:nitro-output',
    resolveId(id) {
      if (id.startsWith(servicePrefix)) return resolve(services, id.slice(servicePrefix.length))
    },
    transform(code, id) {
      if (id === publicAssets) return { code: normalizePublicAssets(code, date), map: null }
      if (id === serverAssets)
        return { code: normalizeServerAssets(code, date), map: { mappings: '' } }
      if (id === '#nitro/virtual/routing' || id === '#nitro/virtual/routing-meta')
        return { code: normalizeRouting(code, pathFor), map: { mappings: '' } }
      if (id === viteServices)
        return { code: stableServices(code, services), map: { mappings: '' } }
    },
    outputOptions(output) {
      return sourceMapOptions(output, pathFor)
    },
  }
}

async function rewriteCopiedMaps(dir, client, pathFor) {
  for (const path of (await readdir(dir, { recursive: true })).sort()) {
    if (!path.endsWith('.map')) continue
    const file = join(dir, path)
    const destination = join(client, path)
    const copied = await readOptional(destination)
    if (copied === undefined || copied !== (await readFile(file, 'utf8'))) continue
    await writeFile(destination, normalizeCopiedMap(copied, pathFor, file))
  }
}

function readOptional(file) {
  return readFile(file, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })
}

async function normalizeWrittenAssets(builder, state) {
  const client = resolve(state.root, builder.environments.client.config.build.outDir)
  for (const env of Object.values(builder.environments)) {
    if (env.name === 'nitro' || env.config.consumer === 'client') continue
    const dir = resolve(state.root, env.config.build.outDir)
    const file = join(dir, assetManifest)
    const code = await readOptional(file)
    if (code === undefined) {
      if (env.name === 'ssr' && state.assetSources.size) throw fail(assetManifest)
      continue
    }
    await writeFile(file, normalizeAssetManifest(code, state.assetKey))
    // The final server consumes the original service maps. Only Nitro's public copies need relabeling.
    if (env.config.build.sourcemap) await rewriteCopiedMaps(dir, client, state.pathFor)
  }
}

/** Normalize the manifest before both the prerenderer and the final server import it. */
export function normalizeViteAssets(state) {
  return function (builder) {
    const write = builder.writeAssetsManifest
    if (state.dev || !write) return
    let written
    builder.writeAssetsManifest = () =>
      (written ??= Promise.resolve(write.call(builder)).then(() =>
        normalizeWrittenAssets(builder, state),
      ))
  }
}

/** Nitro's compiled hook runs before this descriptor exists. */
export async function finalizeBuild(output, date) {
  if (date === undefined) return
  const file = join(output.dir, 'nitro.json')
  const info = JSON.parse(await readFile(file, 'utf8'))
  if (typeof info.date !== 'string') throw fail('nitro.json')
  await writeFile(file, JSON.stringify({ ...info, date }, null, 2))
}
