// The build half of the poster bake: a module that registers the baked stills, each one a hashed build asset.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ID = 'virtual:kerf/posters'
const RESOLVED = `\0${ID}`

/** The module for a manifest: one asset import per still, and the records under each scene's id. */
export function postersModule(folder, manifest) {
  const imports = []
  const entries = []
  for (const [id, tiers] of Object.entries(manifest?.posters ?? {})) {
    const fields = []
    for (const [tier, record] of Object.entries(tiers)) {
      const name = `still${imports.length}`
      imports.push(`import ${name} from ${JSON.stringify(join(folder, record.src))}`)
      const { bytes: _bytes, ms: _ms, ...rest } = record
      fields.push(`${JSON.stringify(tier)}: { ...${JSON.stringify(rest)}, src: ${name} }`)
    }
    entries.push(`${JSON.stringify(id)}: { ${fields.join(', ')} }`)
  }
  return [
    `import { bakedPosters } from '@kerf-js/veneer/scenes'`,
    ...imports,
    `export default bakedPosters({ ${entries.join(', ')} })`,
  ].join('\n')
}

/** A Vite plugin: `import 'virtual:kerf/posters'` registers what a bake wrote in `dir` (default `posters`). */
export function posters(options = {}) {
  let root = process.cwd()
  return {
    name: 'kerf-capture-posters',
    configResolved(config) {
      root = config.root
    },
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return
      const folder = resolve(root, options.dir ?? 'posters')
      const file = join(folder, 'posters.json')
      if (!existsSync(file)) return postersModule(folder, null)
      this.addWatchFile(file)
      return postersModule(folder, JSON.parse(readFileSync(file, 'utf8')))
    },
  }
}
