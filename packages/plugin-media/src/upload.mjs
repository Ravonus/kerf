// Video, audio and animated GIFs through media.server@1, for uploads a build never saw (research 15 §5.4). `ingest`
// answers with the record at once and a queue encodes the rungs one at a time, so a server isn't swamped by a burst.
// Until a rung exists its URL gives the original if browsers can play that, marked temporary so nothing caches it, and
// otherwise waits for that encode. A queue lost to a restart costs nothing: the first request for a rung encodes it.
// No quality search here: fixed CRFs, and H.264 already at its width is kept (re-encoding can't win, research 15 §3.4).
import { join } from 'node:path'
import { ladderOf } from './video.mjs'
import { createIngest } from './upload/ingest.mjs'
import { createRecord } from './upload/record.mjs'
import { createRung } from './upload/rung.mjs'
import { createVideo } from './upload/video.mjs'
import { createGif } from './upload/gif.mjs'
import { createServe } from './upload/serve.mjs'

const TYPES = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  m4a: 'audio/mp4',
  gif: 'image/gif',
  webp: 'image/webp',
}
const COMPATIBLE = 'video/h264'
const SMALLER = 0.85

/** Video or audio, from the first bytes: what ffprobe should be asked about, not what the file's name claims. */
export function sniff(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 12))
  if (head.slice(4, 8) === 'ftyp') return /^M4A|^M4B/.test(head.slice(8, 12)) ? 'audio' : 'video'
  if (bytes[0] === 0x1a && bytes[1] === 0x45) return 'video'
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE') return 'audio'
  if (
    head.startsWith('OggS') ||
    head.startsWith('fLaC') ||
    head.startsWith('ID3') ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  )
    return 'audio'
  return null
}

const webKept = (info) =>
  info.video?.codec === 'h264' &&
  info.video.pix === 'yuv420p' &&
  (!info.audio || info.audio.codec === 'aac')
const playable = (info) =>
  webKept(info) || (/webm/.test(info.format) && ['vp9', 'av1'].includes(info.video?.codec))

export function uploads({ o, dir, encode, url, store, refuse }) {
  const flight = new Map()
  let line = Promise.resolve()
  const efficient = () => (o.video.codecs ?? []).map((c) => `video/${c}`).find((k) => encode[k])
  const sourceOf = (hash) => join(dir, hash, 'source')

  const rung = createRung(dir, encode, sourceOf, flight, COMPATIBLE)

  const enqueue = (hash, meta) => {
    for (const [width, format] of meta.rungs)
      line = line
        .then(() => rung(hash, meta, width, format))
        .catch((e) => console.error(`media: ${hash}: ${e.message}`))
  }

  const record = createRecord(url)

  /** Rungs for a video: AV1 or VP9 first when there's something to gain, H.264 always. */
  function videoRungs(info, width) {
    const widths = ladderOf(o, width)
    const keepTop = webKept(info) && widths.at(-1) === width ? width : undefined
    const webm = keepTop === undefined ? efficient() : undefined
    return {
      keepTop,
      webm,
      rungs: [...(webm ? widths.map((w) => [w, 'webm']) : []), ...widths.map((w) => [w, 'mp4'])],
    }
  }

  const hasCopy = () => o.encoder === 'compatible'
  const compatible = (asset) => (hasCopy() ? { ...asset, swap: o.swap ?? 'intent' } : asset)

  const video = createVideo(
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
  )

  const ingest = createIngest(
    encode,
    sourceOf,
    refuse,
    record,
    url,
    enqueue,
    store,
    video,
    COMPATIBLE,
  )

  const gif = createGif(
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
  )

  const serve = createServe(dir, sourceOf, rung, TYPES)

  return { ingest, gif, serve, settled: () => line }
}
