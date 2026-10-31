// Video, audio and animated GIFs through media.server@1, for uploads a build never saw (research 15 §5.4). `ingest`
// answers with the record at once and a queue encodes the rungs one at a time, so a server isn't swamped by a burst.
// Until a rung exists its URL gives the original if browsers can play that, marked temporary so nothing caches it, and
// otherwise waits for that encode. A queue lost to a restart costs nothing: the first request for a rung encodes it.
// No quality search here: fixed CRFs, and H.264 already at its width is kept (re-encoding can't win, research 15 §3.4).
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { ladderOf, poster } from './video.mjs'

const TYPES = { mp4: 'video/mp4', webm: 'video/webm', m4a: 'audio/mp4', gif: 'image/gif', webp: 'image/webp' }
const COMPATIBLE = 'video/h264'
const SMALLER = 0.85

/** Video or audio, from the first bytes: what ffprobe should be asked about, not what the file's name claims. */
export function sniff(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 12))
  if (head.slice(4, 8) === 'ftyp') return /^M4A|^M4B/.test(head.slice(8, 12)) ? 'audio' : 'video'
  if (bytes[0] === 0x1a && bytes[1] === 0x45) return 'video'
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE') return 'audio'
  if (head.startsWith('OggS') || head.startsWith('fLaC') || head.startsWith('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio'
  return null
}

const webKept = info => info.video?.codec === 'h264' && info.video.pix === 'yuv420p' && (!info.audio || info.audio.codec === 'aac')
const playable = info => webKept(info) || (/webm/.test(info.format) && ['vp9', 'av1'].includes(info.video?.codec))

export function uploads({ o, dir, encode, url, store, refuse }) {
  const flight = new Map()
  let line = Promise.resolve()
  const efficient = () => (o.video.codecs ?? []).map(c => `video/${c}`).find(k => encode[k])
  const sourceOf = hash => join(dir, hash, 'source')

  /** One rung, encoded once: the queue and a waiting request share the work, and the file lands whole or not at all. */
  function rung(hash, meta, width, format) {
    const file = join(dir, hash, `${width}.${format}`)
    if (existsSync(file)) return readFileSync(file)
    const key = `${hash}/${width}.${format}`
    if (!flight.has(key)) {
      const work = (async () => {
        const audio = meta.kind === 'audio'
        const enc = encode[audio ? (format === 'webm' ? 'audio/opus' : 'audio/aac') : format === 'webm' ? meta.webm : COMPATIBLE]
        const copy = meta.keepTop === width && format === 'mp4'
        const bytes = await enc.encode(sourceOf(hash), audio ? {} : copy ? { copy } : { width, knob: enc.knob.fixed })
        const tmp = `${file}.${process.pid}.tmp`
        writeFileSync(tmp, bytes)
        renameSync(tmp, file)
        return bytes
      })().finally(() => flight.delete(key))
      flight.set(key, work)
    }
    return flight.get(key)
  }

  const enqueue = (hash, meta) => {
    for (const [width, format] of meta.rungs) line = line.then(() => rung(hash, meta, width, format)).catch(e => console.error(`media: ${hash}: ${e.message}`))
  }

  const record = (hash, rungs, types) => [...new Set(rungs.map(r => r[1]))].map(format => ({ type: types[format], srcset: rungs.filter(r => r[1] === format).map(([w]) => `${url(hash, w, format)} ${w || 1}w`).join(', ') }))

  /** Rungs for a video: AV1 or VP9 first when there's something to gain, H.264 always. */
  function videoRungs(info, width) {
    const widths = ladderOf(o, width)
    const keepTop = webKept(info) && widths.at(-1) === width ? width : undefined
    const webm = keepTop === undefined ? efficient() : undefined
    return { keepTop, webm, rungs: [...(webm ? widths.map(w => [w, 'webm']) : []), ...widths.map(w => [w, 'mp4'])] }
  }

  const hasCopy = () => o.encoder === 'compatible'
  const compatible = asset => (hasCopy() ? { ...asset, swap: o.swap ?? 'intent' } : asset)

  async function video(hash, bytes, name, info, extra = {}) {
    const { width, height } = info.video
    const plan = videoRungs(info, width)
    const types = { webm: `video/webm; codecs="${plan.webm === 'video/vp9' ? 'vp9' : 'av01.0.08M.08'}${info.audio ? ', opus' : ''}"`, mp4: 'video/mp4' }
    const cover = await poster(encode[COMPATIBLE], sourceOf(hash), 'poster', width, info.duration, o)
    writeFileSync(join(dir, hash, 'poster.webp'), cover.file.bytes)
    const top = url(hash, plan.rungs.at(-1)[0], 'mp4')
    const asset = compatible({ kind: 'video', src: top, width, height, type: 'video/mp4', sources: record(hash, plan.rungs, types), name, quality: 'fixed', duration: info.duration, audio: !!info.audio, ...cover.asset, poster: url(hash, 0, 'webp'), ...(plan.webm && hasCopy() && { copy: { src: top, type: 'video/mp4' } }), ...extra.asset })
    const meta = { kind: 'video', timed: true, ...plan, playable: playable(info) }
    return { asset, meta }
  }

  async function ingest(hash, bytes, name, kind) {
    const enc = encode[COMPATIBLE]
    writeFileSync(sourceOf(hash), bytes)
    const info = await enc.info(sourceOf(hash)).catch(() => null)
    if (kind === 'audio') {
      if (!info?.audio) refuse('M018', `${name} has no audio track weft can read.`)
      const rungs = [...(encode['audio/opus'] ? [[0, 'webm']] : []), [0, 'm4a']]
      const asset = { kind: 'audio', src: url(hash, 0, 'm4a'), width: 0, height: 0, type: 'audio/mp4', sources: record(hash, rungs, { webm: 'audio/webm; codecs="opus"', m4a: 'audio/mp4; codecs="mp4a.40.2"' }), name, quality: 'fixed', duration: info.duration, audio: true }
      const meta = { kind, timed: true, rungs }
      enqueue(hash, meta)
      return store(hash, bytes, asset, meta)
    }
    if (!info?.video) refuse('M018', `${name} has no video track weft can read.`)
    const { asset, meta } = await video(hash, bytes, name, info)
    enqueue(hash, meta)
    return store(hash, bytes, asset, meta)
  }

  /** An animated GIF: null when it should stay one (the rules in src/video.mjs, on the top H.264 rung). */
  async function gif(hash, bytes, name, meta) {
    if (!encode[COMPATIBLE] || bytes.length < (o.gif?.keepUnder ?? 8192) || (meta.pages ?? 1) < 4 || o.gif?.toVideo === 'never') return null
    if (!(await sharp(bytes, { animated: true }).stats()).isOpaque) return null
    writeFileSync(sourceOf(hash), bytes)
    const info = await encode[COMPATIBLE].info(sourceOf(hash))
    const width = meta.width
    const height = meta.pageHeight ?? meta.height
    const delays = meta.delay ?? []
    const duration = delays.length ? delays.reduce((a, b) => a + (b < 20 ? 100 : b), 0) / 1000 : info.duration
    const full = { ...info, duration, video: { ...info.video, width, height } }
    const { asset, meta: plan } = await video(hash, bytes, name, full)
    const top = plan.rungs.at(-1)[0]
    if ((await rung(hash, plan, top, 'mp4')).length > bytes.length * SMALLER) return null
    Object.assign(asset, { animated: true, audio: false, loop: meta.loop ?? 0 })
    if (hasCopy()) asset.copy = { src: url(hash, width, 'gif'), type: 'image/gif', bytes: bytes.length }
    plan.gif = width
    enqueue(hash, plan)
    return store(hash, bytes, asset, plan)
  }

  async function serve(hash, meta, width, format) {
    if (format === 'webp' && width === 0) return { bytes: readFileSync(join(dir, hash, 'poster.webp')), type: TYPES.webp, width, format, negotiated: false }
    if (format === 'gif' && meta.gif === width) return { bytes: readFileSync(sourceOf(hash)), type: TYPES.gif, width, format, negotiated: false }
    if (!meta.rungs.some(([w, f]) => w === width && f === format)) return null
    const ready = existsSync(join(dir, hash, `${width}.${format}`))
    if (!ready && meta.playable) return { bytes: readFileSync(sourceOf(hash)), type: TYPES[format], width, format, negotiated: false, temporary: true }
    return { bytes: new Uint8Array(await rung(hash, meta, width, format)), type: meta.kind === 'audio' && format === 'webm' ? 'audio/webm' : TYPES[format], width, format, negotiated: false }
  }

  return { ingest, gif, serve, settled: () => line }
}
