// `ingest` stores an original under its hash and returns a `z.media()` record; `serve` answers `/_kerf/m/<hash>/<w>.<fmt>`,
// encoding each variant once and keeping it next to the original. `auto` negotiates on `Accept`. Only widths on the
// ladder and formats in the config are served, so a URL can't ask for unbounded work. Video, audio and animated GIFs go
// through src/upload.mjs when media.encode@1 is bound.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DEFAULTS, MIME } from './shared.mjs'
import { uploads } from './upload.mjs'
import { imageIngest } from './server/ingest.mjs'
import { imageServe } from './server/serve.mjs'

const ROUTE = '/_kerf/m'
const MAX_BYTES = 20 * 1024 * 1024

const refuse = (code, message) => {
  throw Object.assign(new Error(message), { code })
}

/** The first of `formats` the client names with a q above 0, else `fallback`. `*` promises nothing: only names count. */
export function negotiate(accept, formats, fallback) {
  const q = new Map()
  for (const part of accept.split(',')) {
    const [type, ...params] = part.trim().toLowerCase().split(';')
    const v = params.map((p) => /^\s*q=([\d.]+)/.exec(p)?.[1]).find(Boolean)
    q.set(type.trim(), v === undefined ? 1 : Number(v))
  }
  return formats.find((f) => q.get(MIME[f]) > 0) ?? fallback
}

/** The media.server@1 provider: `at(root, encode)` is the store for one app, its `ingest` and its `serve`. */
export function createMediaServer(input = {}) {
  const o = { ...DEFAULTS, ...input, video: { ...DEFAULTS.video, ...input.video } }
  return { at: (root, encode = {}) => storage(o, root, encode) }
}

function storage(o, root, encode) {
  const dir = process.env.KERF_MEDIA_DIR
    ? resolve(process.env.KERF_MEDIA_DIR)
    : resolve(root ?? process.cwd(), o.server?.dir ?? '.kerf/media')
  const limit = o.server?.maxBytes ?? MAX_BYTES
  const flight = new Map()
  const url = (hash, width, format = 'auto') => `${ROUTE}/${hash}/${width}.${format}`
  const metaOf = (hash) => {
    const file = join(dir, hash, 'meta.json')
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
  }

  /** The record and what `serve` needs; written last, so a meta.json means the original is whole. */
  function store(hash, bytes, asset, meta) {
    mkdirSync(join(dir, hash), { recursive: true })
    writeFileSync(join(dir, hash, 'source'), bytes)
    const tmp = join(dir, hash, `meta.${process.pid}.tmp`)
    writeFileSync(tmp, JSON.stringify({ ...meta, asset }))
    renameSync(tmp, join(dir, hash, 'meta.json'))
    return asset
  }

  const timed = uploads({ o, dir, encode, url, store, refuse })

  const ingest = imageIngest({ limit, metaOf, dir, encode, timed, url, store, refuse, o })

  const serve = imageServe({ dir, flight, metaOf, timed, o, negotiate })

  return { ingest, serve, settled: timed.settled }
}
