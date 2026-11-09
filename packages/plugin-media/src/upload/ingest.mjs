import { writeFileSync } from 'node:fs'

export function createIngest({
  encode,
  sourceOf,
  refuse,
  record,
  url,
  enqueue,
  store,
  video,
  COMPATIBLE,
}) {
  return async function ingest(hash, bytes, name, kind) {
    const enc = encode[COMPATIBLE]
    writeFileSync(sourceOf(hash), bytes)
    const info = await enc.info(sourceOf(hash)).catch(() => null)
    if (kind === 'audio') {
      if (!info?.audio) refuse('M018', `${name} has no audio track weft can read.`)
      const rungs = [...(encode['audio/opus'] ? [[0, 'webm']] : []), [0, 'm4a']]
      const asset = {
        kind: 'audio',
        src: url(hash, 0, 'm4a'),
        width: 0,
        height: 0,
        type: 'audio/mp4',
        sources: record(hash, rungs, {
          webm: 'audio/webm; codecs="opus"',
          m4a: 'audio/mp4; codecs="mp4a.40.2"',
        }),
        name,
        quality: 'fixed',
        duration: info.duration,
        audio: true,
      }
      const meta = { kind, timed: true, rungs }
      enqueue(hash, meta)
      return store(hash, bytes, asset, meta)
    }
    if (!info?.video) refuse('M018', `${name} has no video track weft can read.`)
    const { asset, meta } = await video(hash, bytes, name, info)
    enqueue(hash, meta)
    return store(hash, bytes, asset, meta)
  }
}
