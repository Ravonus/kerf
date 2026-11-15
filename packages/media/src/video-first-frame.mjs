import { createFirstFrameBuild } from './first-frame.mjs'
import { onDisk } from './video/common.mjs'
import { retainVideoOriginal } from './video-original.mjs'

/** Standard imports get a verified sharp first frame without an app-owned preparation script. */
export async function videoFirstFrame(source, out, o, context) {
  if (out.asset?.kind !== 'video') return out
  retainVideoOriginal(source, out)
  if (o.video.firstFrame === false) return out
  const frame = await onDisk(source.name, source.bytes, (file) =>
    createFirstFrameBuild({ widths: o.video.widths, ...o.video.firstFrameQuality }).build(
      { file },
      context,
    ),
  )
  const old = out.asset.poster,
    placeholder = out.asset.placeholder
  out.files = out.files.filter((file) => file.name !== old && file.name !== placeholder)
  delete out.asset.placeholder
  delete out.asset.dominant
  const { src, type, width, height, sources } = frame.asset
  out.asset.poster = src
  out.asset.firstFrame = {
    src,
    type,
    width,
    height,
    sources,
    pixels: frame.verification.pixels,
    target: frame.verification.target,
    time: 0,
  }
  out.files.push(...frame.files)
  out.verification = { ...out.verification, firstFrame: frame.verification }
  return out
}
