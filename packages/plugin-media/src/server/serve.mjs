import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { FIXED, encoders, MIME } from '../shared.mjs'

const FORMATS_TIMED = new Set(['mp4', 'webm', 'm4a', 'gif', 'webp'])
const EXT = { avif: 'avif', webp: 'webp', jpeg: 'jpg', png: 'png' }
const FORMAT = { avif: 'avif', webp: 'webp', jpg: 'jpeg', png: 'png' }

export function imageServe({ dir, flight, metaOf, timed, o, negotiate }) {
  /** One variant, encoded once: concurrent requests share the encode, and the file lands whole or not at all. */
  function variant(hash, width, format) {
    const file = join(dir, hash, `${width}.${EXT[format]}`)
    if (existsSync(file)) return readFileSync(file)
    const key = `${hash}/${width}.${format}`
    if (!flight.has(key)) {
      const work = (async () => {
        const img = sharp(readFileSync(join(dir, hash, 'source')))
          .rotate()
          .resize({ width })
        const bytes = await encoders[format](img, FIXED[format]).toBuffer()
        const tmp = `${file}.${process.pid}.tmp`
        writeFileSync(tmp, bytes)
        renameSync(tmp, file)
        return bytes
      })().finally(() => flight.delete(key))
      flight.set(key, work)
    }
    return flight.get(key)
  }

  async function serve({ hash, width, format, accept }) {
    const meta = /^[0-9a-f]{32}$/.test(hash) ? metaOf(hash) : null
    if (meta?.timed)
      return FORMATS_TIMED.has(format) ? timed.serve(hash, meta, width, format) : null
    if (!meta?.ladder.includes(width)) return null
    const negotiated = format === 'auto'
    if (meta.type)
      return negotiated
        ? {
            bytes: readFileSync(join(dir, hash, 'source')),
            type: meta.type,
            width,
            format: 'source',
            negotiated: false,
          }
        : null
    const fmt = negotiated ? negotiate(accept, o.formats, meta.fallback) : FORMAT[format]
    if (!fmt || !(fmt === meta.fallback || o.formats.includes(fmt))) return null
    return {
      bytes: new Uint8Array(await variant(hash, width, fmt)),
      type: MIME[fmt],
      width,
      format: fmt,
      negotiated,
    }
  }

  return serve
}
