// `import plate from './plate.gen.json?gen'`: each slot's committed basis, served and emitted by Vite as a `?url`
// asset, with its kind, dimensions, digest and fitted params. It reads the recipe and the lock only and never calls a
// model: a slot with no basis fails the build, naming the calls `gen run` would make.
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { defaultCacheDir, loadRecipe, rawFile, readLock } from './store.mjs'

const QUERY = /\?gen(?:&bake=([^&]+))?$/
const VIRTUAL = '\0keel-gen:'
// After the path, so the id ends in neither `.json` nor `.json?…` and the JSON plugin leaves it alone.
const END = ':gen.mjs'

/** The module for a recipe: one `?url` import per slot's basis, and the records. */
function records(file) {
  const { slots, lockFile, styleFile, dir } = loadRecipe(file)
  const lock = readLock(lockFile)
  const missing = slots.filter(
    (slot) => !lock.slots[slot.name] || !existsSync(join(dir, lock.slots[slot.name].basis.file)),
  )
  if (missing.length)
    throw new Error(
      `keel gen: ${file}: no basis for ${missing.map((slot) => slot.name).join(', ')}. ` +
        `\`gen run\` would make ${missing.length} call${missing.length > 1 ? 's' : ''} for them.`,
    )
  const imports = []
  const fields = slots.map((slot, i) => {
    const { basis } = lock.slots[slot.name]
    imports.push(`import b${i} from ${JSON.stringify(`${join(dir, basis.file)}?url`)}`)
    const rest = JSON.stringify({
      kind: basis.kind,
      dims: basis.dims,
      digest: basis.digest,
      params: basis.params,
    })
    return `  ${JSON.stringify(slot.name)}: { basis: b${i}, ...${rest} },`
  })
  const code = `${imports.join('\n')}\nexport default {\n${fields.join('\n')}\n}\n`
  return { code, watch: [lockFile, styleFile] }
}

/** The raw output a slot's lock entry chose, handed on as `?media`, for a baked comparison. */
function baked(file, slot, cacheDir) {
  const { lockFile } = loadRecipe(file)
  const entry = readLock(lockFile).slots[slot]
  const raw = entry && rawFile(cacheDir, entry)
  if (!raw) throw new Error(`keel gen: ${file}: no raw output for ${slot} in ${cacheDir}`)
  return `export { default } from ${JSON.stringify(`${raw}?media`)}\n`
}

/**
 * The Vite plugin for `?gen` imports, before kerf's own (which encodes the `?media` image a `&bake=` import hands on).
 *
 * @param options `cacheDir`: where `gen run` keeps raw outputs, for `&bake=`; default `<root>/.kerf/cache/gen`.
 */
export function keelGen(options = {}) {
  let cacheDir = options.cacheDir
  return {
    name: 'keel:gen',
    enforce: 'pre',
    configResolved(config) {
      cacheDir ??= defaultCacheDir(config.root)
    },
    async resolveId(source, importer) {
      const match = QUERY.exec(source)
      if (!match) return null
      const path = source.replace(QUERY, '')
      const found = await this.resolve(path, importer, { skipSelf: true })
      const file = found?.id ?? resolve(dirname(importer ?? ''), path)
      return `${VIRTUAL}${file}${match[1] ? `#bake=${match[1]}` : ''}${END}`
    },
    load(id) {
      if (!id.startsWith(VIRTUAL)) return null
      const [file, bake] = id.slice(VIRTUAL.length, -END.length).split('#bake=')
      this.addWatchFile(file)
      if (bake !== undefined) return baked(file, decodeURIComponent(bake), cacheDir)
      const { code, watch } = records(file)
      for (const path of watch) this.addWatchFile(path)
      return code
    },
  }
}
