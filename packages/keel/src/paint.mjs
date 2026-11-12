// `import ground from './card.paint.json?paint'`: a surface painted from a seeded recipe at build time, handed on as a
// `?media&photo` image, so the page gets a media record (an AVIF ladder, a JPEG fallback and a placeholder with
// `media()`, the PNG alone without). Painting runs on the CPU on Node worker threads, with the arithmetic the GPU
// painter uses. A painted PNG is kept under `.kerf/cache/paint`, keyed by the plan's digest and the module's version: an unchanged recipe paints nothing.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import { crc32, deflateSync } from 'node:zlib'
import { recipeOf } from './paint-recipe.mjs'

const QUERY = /\?paint$/
const VIRTUAL = '\0keel-paint:'
// After the path, so the id ends in neither `.json` nor `.json?…` and the JSON plugin leaves it alone.
const END = ':paint.mjs'
const MODULE = fileURLToPath(new URL('../vendor/modules/surfaces.mjs', import.meta.url))
/** Moves when the PNG written for the same pixels would change. */
const ENCODING = 2

/** The module's version, from the header the vendor script writes. */
const versionOf = (source) => /^\/\/ surfaces@(\S+)/.exec(source)?.[1] ?? '0'

/**
 * Threads that paint: up to `size` at once, started when first asked and stopped by `close`. Each paint takes a
 * second or so on the CPU, so a page's paints run side by side rather than one after another.
 */
export function createPaintPool(size = Math.max(1, Math.min(4, availableParallelism() - 1))) {
  const idle = []
  const all = []
  const queue = []
  const busy = new Map()
  // An idle thread is unref'd, so a pool nobody closed never keeps Node running.
  const give = (worker) => {
    const job = queue.shift()
    if (!job) {
      worker.unref()
      return idle.push(worker)
    }
    busy.set(worker, job)
    worker.ref()
    worker.postMessage(job.request)
  }
  const start = () => {
    const worker = new Worker(new URL('./paint-worker.mjs', import.meta.url))
    worker.on('message', ({ error, ...done }) => {
      const job = busy.get(worker)
      busy.delete(worker)
      if (error === undefined) job?.resolve(done)
      else job?.reject(new Error(error))
      give(worker)
    })
    worker.on('error', (error) => {
      busy.get(worker)?.reject(error)
      busy.delete(worker)
      all.splice(all.indexOf(worker), 1)
    })
    all.push(worker)
    return worker
  }
  return {
    /** The PNG of a request, `{ bytes, width, height }`, painted on one of the threads. */
    paint(request) {
      return new Promise((done, fail) => {
        queue.push({ request, resolve: done, reject: fail })
        const worker = idle.pop() ?? (all.length < size ? start() : null)
        if (worker) give(worker)
      })
    },
    close: () => Promise.all(all.splice(0).map((w) => w.terminate())).then(() => {}),
  }
}

/** RGBA rows as an RGB PNG, no filter, deflated: an albedo is opaque, so its alpha is left out. */
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
  head.set([8, 2, 0, 0, 0], 8)
  const row = width * 3
  const raw = Buffer.alloc((row + 1) * height)
  for (let y = 0, at = 0; y < height; y++) {
    at++
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      raw[at++] = rgba[i]
      raw[at++] = rgba[i + 1]
      raw[at++] = rgba[i + 2]
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * The painted PNG for a recipe file, from the cache or painted now, on `pool`'s threads or else on this one. `log`
 * hears how long a paint took.
 *
 * @returns The PNG's path and whether it was painted now.
 */
export async function paintFile(file, cacheDir, log = () => {}, pool = null) {
  const surfaces = await import(MODULE)
  const request = JSON.parse(readFileSync(file, 'utf8'))
  const { recipe, settings } = recipeOf(request, surfaces)
  const plan = surfaces.planSurface(recipe, settings)
  const version = versionOf(readFileSync(MODULE, 'utf8').slice(0, 120))
  const key = createHash('sha256')
    .update(`${plan.digest}:surfaces@${version}:${ENCODING}`)
    .digest('hex')
    .slice(0, 16)
  const stem = basename(file).replace(/\.paint\.json$|\.json$/, '')
  // In a folder named by the key, so the file keeps the recipe's name and the media built from it is `<name>-<w>-…`.
  const out = join(cacheDir, key, `${stem}.png`)
  if (existsSync(out)) return { file: out, painted: false }
  const started = performance.now()
  const { bytes, width, height } = pool
    ? await pool.paint(request)
    : (() => {
        const surface = surfaces.paintPlan(plan)
        const rgba = new Uint8Array(surface.buffers[0])
        return { bytes: png(rgba, surface.width, surface.height), ...surface }
      })()
  mkdirSync(dirname(out), { recursive: true })
  // Written aside and renamed, so a build stopped half-way leaves no torn file under the key.
  writeFileSync(`${out}.part`, bytes)
  renameSync(`${out}.part`, out)
  log(`${basename(file)}: ${width}×${height} in ${Math.round(performance.now() - started)} ms`)
  return { file: out, painted: true }
}

/**
 * The Vite plugin for `?paint` imports, beside kerf's own (which encodes the `?media` image it hands on).
 *
 * @param options `cacheDir`: where painted PNGs are kept, default `<root>/.kerf/cache/paint`. `threads`: how many
 *   paint at once, default one fewer than the cores up to 4; 0 paints on Vite's own thread.
 */
export function keelPaint(options = {}) {
  let cacheDir = options.cacheDir
  let say = () => {}
  let pool = null
  return {
    name: 'keel:paint',
    enforce: 'pre',
    configResolved(config) {
      cacheDir ??= join(config.root, '.kerf', 'cache', 'paint')
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
      if (options.threads !== 0) pool ??= createPaintPool(options.threads)
      const painted = await paintFile(file, cacheDir, say, pool)
      // A painting is photographic: a JPEG fallback, not a lossless PNG one.
      return `export { default } from ${JSON.stringify(`${painted.file}?media&photo`)}\n`
    },
    async buildEnd() {
      await pool?.close()
      pool = null
    },
  }
}
