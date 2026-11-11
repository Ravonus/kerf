// `import ground from './card.paint.json?paint'`: a surface painted from a seeded recipe at build time, handed on as a
// `?media` image, so the page gets a media record (an AVIF ladder and a placeholder with `media()`, the PNG alone
// without). Painting runs on the CPU in Node, with the arithmetic the GPU painter uses. A painted PNG is kept under
// `.weft/cache/paint`, keyed by the plan's digest and the module's version: an unchanged recipe paints nothing.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import { recipeOf } from './paint-recipe.mjs'

const QUERY = /\?paint$/
const VIRTUAL = '\0keel-paint:'
// After the path, so the id ends in neither `.json` nor `.json?…` and the JSON plugin leaves it alone.
const END = ':paint.mjs'
const MODULE = fileURLToPath(new URL('../vendor/modules/surfaces.mjs', import.meta.url))
/** Moves when the PNG written for the same pixels would change. */
const ENCODING = 1

/** The module's version, from the header the vendor script writes. */
const versionOf = (source) => /^\/\/ surfaces@(\S+)/.exec(source)?.[1] ?? '0'

/** RGBA rows as a PNG: no filter, deflated. */
export function png(rgba, width, height) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'latin1')
    data.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
    return out
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head.set([8, 6, 0, 0, 0], 8)
  const row = width * 4
  const raw = Buffer.alloc((row + 1) * height)
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * row, (y + 1) * row), y * (row + 1) + 1)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * The painted PNG for a recipe file, from the cache or painted now. `log` hears how long a paint took.
 *
 * @returns The PNG's path and whether it was painted now.
 */
export async function paintFile(file, cacheDir, log = () => {}) {
  const surfaces = await import(MODULE)
  const { recipe, settings } = recipeOf(JSON.parse(readFileSync(file, 'utf8')), surfaces)
  const plan = surfaces.planSurface(recipe, settings)
  const version = versionOf(readFileSync(MODULE, 'utf8').slice(0, 120))
  const key = createHash('sha256')
    .update(`${plan.digest}:surfaces@${version}:${ENCODING}`)
    .digest('hex')
    .slice(0, 16)
  const stem = basename(file).replace(/\.paint\.json$|\.json$/, '')
  const out = join(cacheDir, `${stem}-${key}.png`)
  if (existsSync(out)) return { file: out, painted: false }
  const started = performance.now()
  const surface = surfaces.paintPlan(plan)
  const bytes = png(new Uint8Array(surface.buffers[0]), surface.width, surface.height)
  mkdirSync(cacheDir, { recursive: true })
  // Written aside and renamed, so a build stopped half-way leaves no torn file under the key.
  writeFileSync(`${out}.part`, bytes)
  renameSync(`${out}.part`, out)
  log(
    `${basename(file)}: ${surface.width}×${surface.height} in ${Math.round(performance.now() - started)} ms`,
  )
  return { file: out, painted: true }
}

/**
 * The Vite plugin for `?paint` imports, beside weft's own (which encodes the `?media` image it hands on).
 *
 * @param options `cacheDir`: where painted PNGs are kept, default `<root>/.weft/cache/paint`.
 */
export function keelPaint(options = {}) {
  let cacheDir = options.cacheDir
  let say = () => {}
  return {
    name: 'keel:paint',
    enforce: 'pre',
    configResolved(config) {
      cacheDir ??= join(config.root, '.weft', 'cache', 'paint')
      say = (line) => config.logger.info(`keel paint: ${line}`)
    },
    async resolveId(source, importer) {
      if (!QUERY.test(source)) return null
      const path = source.replace(QUERY, '')
      const found = await this.resolve(path, importer, { skipSelf: true })
      return `${VIRTUAL}${found?.id ?? resolve(dirname(importer ?? ''), path)}${END}`
    },
    async load(id) {
      if (!id.startsWith(VIRTUAL)) return null
      const file = id.slice(VIRTUAL.length, -END.length)
      this.addWatchFile(file)
      const painted = await paintFile(file, cacheDir, say)
      return `export { default } from ${JSON.stringify(`${painted.file}?media`)}\n`
    },
  }
}
