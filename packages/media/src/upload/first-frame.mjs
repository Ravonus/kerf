import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFirstFrameBuild } from '../first-frame.mjs'

/** Persist upload previews in the same public media route as their native playback rungs. */
export async function uploadFirstFrame({ file, dir, hash, o, encode, url }) {
  const built = await createFirstFrameBuild({ widths: o.video.widths }).build(
    { file },
    { cacheDir: join(dir, '.first-frames'), encode },
  )
  const files = new Map(built.files.map((output) => [output.name, output.bytes])),
    firstFrames = {}
  const sources = built.asset.sources.map((source) => ({
    ...source,
    srcset: source.srcset
      .split(', ')
      .map((entry) => {
        const [name, size] = entry.split(' '),
          width = Number.parseInt(size),
          format = source.type.split('/')[1],
          key = `${width}.${format}`
        writeFileSync(join(dir, hash, name), files.get(name))
        firstFrames[key] = { name, type: source.type }
        return `${url(hash, width, format)} ${width}w`
      })
      .join(', '),
  }))
  const { type, width, height } = built.asset,
    format = type.split('/')[1],
    src = url(hash, width, format)
  firstFrames[`0.${format}`] = firstFrames[`${width}.${format}`]
  return {
    asset: {
      poster: url(hash, 0, format),
      firstFrame: { src, type, width, height, sources, pixels: 'exact', time: 0 },
    },
    firstFrames,
  }
}
