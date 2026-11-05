import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function createServe({ dir, sourceOf, rung, TYPES }) {
  return async function serve(hash, meta, width, format) {
    if (format === 'webp' && width === 0)
      return {
        bytes: readFileSync(join(dir, hash, 'poster.webp')),
        type: TYPES.webp,
        width,
        format,
        negotiated: false,
      }
    if (format === 'gif' && meta.gif === width)
      return {
        bytes: readFileSync(sourceOf(hash)),
        type: TYPES.gif,
        width,
        format,
        negotiated: false,
      }
    if (!meta.rungs.some(([w, f]) => w === width && f === format)) return null
    const ready = existsSync(join(dir, hash, `${width}.${format}`))
    if (!ready && meta.playable)
      return {
        bytes: readFileSync(sourceOf(hash)),
        type: TYPES[format],
        width,
        format,
        negotiated: false,
        temporary: true,
      }
    return {
      bytes: new Uint8Array(await rung(hash, meta, width, format)),
      type: meta.kind === 'audio' && format === 'webm' ? 'audio/webm' : TYPES[format],
      width,
      format,
      negotiated: false,
    }
  }
}
