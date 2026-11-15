import { readFileSync } from 'node:fs'
import { uploadFirstFrame } from './first-frame.mjs'
import { originalVideo } from '../video-original.mjs'
/** Re-ingesting a retained upload upgrades its preview while preserving the original source and hash. */
export function createUpgrade({ sourceOf, dir, o, encode, url, store }) {
  return async (hash, known) => {
    if (known.asset.kind !== 'video') return known.asset
    const target = o.video.firstFrameQuality?.target ?? 100
    const matches = known.asset.firstFrame && (known.asset.firstFrame.target ?? 100) === target
    if (known.asset.original && (matches || o.video.firstFrame === false)) return known.asset
    const source = readFileSync(sourceOf(hash))
    const frame =
      !matches && o.video.firstFrame !== false
        ? await uploadFirstFrame({ file: sourceOf(hash), dir, hash, o, encode, url })
        : { asset: {}, firstFrames: known.firstFrames }
    const asset = {
      ...known.asset,
      ...frame.asset,
      original:
        known.asset.original ??
        originalVideo({ name: known.asset.name, bytes: source }, url(hash, 0, 'source')),
    }
    delete asset.placeholder
    delete asset.dominant
    const { asset: _previous, ...meta } = known
    return store(hash, source, asset, { ...meta, firstFrames: frame.firstFrames })
  }
}
