import { writeFileSync } from 'node:fs'
import sharp from 'sharp'

export function createGif(
  encode,
  o,
  sourceOf,
  video,
  rung,
  hasCopy,
  url,
  enqueue,
  store,
  COMPATIBLE,
  SMALLER,
) {
  /** An animated GIF: null when it should stay one (the rules in src/video.mjs, on the top H.264 rung). */
  return async function gif(hash, bytes, name, meta) {
    if (
      !encode[COMPATIBLE] ||
      bytes.length < (o.gif?.keepUnder ?? 8192) ||
      (meta.pages ?? 1) < 4 ||
      o.gif?.toVideo === 'never'
    )
      return null
    if (!(await sharp(bytes, { animated: true }).stats()).isOpaque) return null
    writeFileSync(sourceOf(hash), bytes)
    const info = await encode[COMPATIBLE].info(sourceOf(hash))
    const width = meta.width
    const height = meta.pageHeight ?? meta.height
    const delays = meta.delay ?? []
    const duration = delays.length
      ? delays.reduce((a, b) => a + (b < 20 ? 100 : b), 0) / 1000
      : info.duration
    const full = { ...info, duration, video: { ...info.video, width, height } }
    const { asset, meta: plan } = await video(hash, bytes, name, full)
    const top = plan.rungs.at(-1)[0]
    if ((await rung(hash, plan, top, 'mp4')).length > bytes.length * SMALLER) return null
    Object.assign(asset, { animated: true, audio: false, loop: meta.loop ?? 0 })
    if (hasCopy())
      asset.copy = { src: url(hash, width, 'gif'), type: 'image/gif', bytes: bytes.length }
    plan.gif = width
    enqueue(hash, plan)
    return store(hash, bytes, asset, plan)
  }
}
