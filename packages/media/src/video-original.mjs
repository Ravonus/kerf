import { createHash } from 'node:crypto'
import { extname } from 'node:path'
const TYPES = {
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.ogv': 'video/ogg',
  '.gif': 'image/gif',
}
/** Exact source metadata is independent of whichever smaller representation is used for playback. */
export function originalVideo(source, src) {
  return {
    src,
    type: TYPES[extname(source.name).toLowerCase()] ?? 'video/mp4',
    name: source.name,
    bytes: source.bytes.length,
  }
}
/** Retain a source once when legacy native-rendition builds did not already preserve it. */
export function retainVideoOriginal(source, out) {
  if (out.asset.original) return
  const name = `${source.stem}-original-${createHash('sha256').update(source.bytes).digest('hex').slice(0, 20)}${extname(source.name)}`
  out.files.push({ name, bytes: source.bytes })
  out.asset.original = originalVideo(source, name)
}
