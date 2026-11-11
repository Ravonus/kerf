import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { poster } from '../video.mjs'

export function createVideo({
  videoRungs,
  encode,
  sourceOf,
  dir,
  url,
  compatible,
  record,
  hasCopy,
  playable,
  COMPATIBLE,
  o,
}) {
  return async function video(hash, bytes, name, info, extra = {}) {
    const { width, height } = info.video
    const plan = videoRungs(info, width)
    const types = {
      webm: `video/webm; codecs="${plan.webm === 'video/vp9' ? 'vp9' : 'av01.0.08M.08'}${info.audio ? ', opus' : ''}"`,
      mp4: 'video/mp4',
    }
    const cover = await poster({
      enc: encode[COMPATIBLE],
      source: sourceOf(hash),
      stem: 'poster',
      width,
      duration: info.duration,
      // The route serves only the poster and rungs, so an upload's placeholder stays inline.
      o: { ...o, placeholder: !!o.placeholder },
    })
    writeFileSync(join(dir, hash, 'poster.webp'), cover.files[0].bytes)
    const top = url(hash, plan.rungs.at(-1)[0], 'mp4')
    const asset = compatible({
      kind: 'video',
      src: top,
      width,
      height,
      type: 'video/mp4',
      sources: record(hash, plan.rungs, types),
      name,
      quality: 'fixed',
      duration: info.duration,
      audio: !!info.audio,
      ...cover.asset,
      poster: url(hash, 0, 'webp'),
      ...(plan.webm && hasCopy() && { copy: { src: top, type: 'video/mp4' } }),
      ...extra.asset,
    })
    const meta = { kind: 'video', timed: true, ...plan, playable: playable(info) }
    return { asset, meta }
  }
}
