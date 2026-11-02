// Video, audio and GIF-to-video for media.build@1 (research 15 §3.3–3.4), through whichever providers media.encode@1
// has bound (`@weft-js/plugin-media-ffmpeg`).
//   Keep what is already delivered: an H.264 source at or under the top width is remuxed, not re-encoded, and an
//   efficient codec has to beat the H.264 file by 15% to ship (re-encoding a lossy source can't win at a fixed target).
//   Quality: a CRF search at the top width, sampled SSIMULACRA2 frames with mean ≥ target and worst frame ≥ target − 5.
//   A mean alone lets AV1 hide ugly frames (research 15 measured 55 inside an 80 mean). No scorer: fixed CRFs.
//   GIFs stay GIFs under 8 KB, under 4 frames, with real transparency (H.264 has no alpha; animated WebP does), or when
//   nothing is 15% smaller. Noisy GIFs came out 70–180% larger as video.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'

const run = promisify(execFile)
export const VIDEO = /\.(mp4|m4v|mov|webm|mkv|ogv)$/i
export const AUDIO = /\.(mp3|wav|flac|ogg|oga|opus|m4a|aac)$/i
const SMALLER = 0.85
const COMPATIBLE = 'video/h264'
const short = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 8)
const need = (o, key) => ({ code: 'P101', severity: 'error', message: `${o} needs \`media.encode\` for ${key}, and nothing provides it. Add \`mediaFfmpeg()\` from @weft-js/plugin-media-ffmpeg to \`plugins\` in weft.config.ts.` })
const errored = (name, e) => ({ asset: null, files: [], diagnostics: [{ code: e.code ?? 'M019', severity: 'error', message: `${name}: ${e.message}` }] })

/** A temp file for ffmpeg to read: `work(path)` runs with the bytes on disk. */
async function onDisk(name, bytes, work) {
  const dir = mkdtempSync(join(tmpdir(), 'weft-media-'))
  try {
    const path = join(dir, `in${extname(name).toLowerCase()}`)
    writeFileSync(path, bytes)
    return await work(path, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const sourceType = (enc, info) => {
  const container = enc.ext === 'webm' ? 'video/webm' : 'video/mp4'
  return `${container}; codecs="${[info.video?.string, info.audio?.string].filter(Boolean).join(', ')}"`
}

/** SSIMULACRA2 over `times`: mean ≥ target and worst ≥ target − 5. */
async function passes(enc, source, encoded, ctx) {
  return onDisk(`x.${enc.ext}`, encoded, async (file, dir) => {
    const scores = []
    for (const [i, at] of ctx.times.entries()) {
      const ref = join(dir, `ref${i}.png`)
      const out = join(dir, `out${i}.png`)
      writeFileSync(ref, await enc.still(source, { at, width: ctx.width }))
      writeFileSync(out, await enc.still(file, { at, width: ctx.width }))
      scores.push(parseFloat((await run(ctx.scorer, [ref, out])).stdout))
    }
    return scores.reduce((a, b) => a + b) / scores.length >= ctx.target && Math.min(...scores) >= ctx.target - 5
  })
}

/** The highest CRF that passes, within 4 encodes. Video-only: audio has its own bitrate. */
async function search(enc, source, ctx) {
  let { min: lo, max: hi } = enc.knob
  let best = lo
  for (let i = 0; i < 4 && lo <= hi; i++) {
    const knob = Math.round((lo + hi) / 2)
    if (await passes(enc, source, await enc.encode(source, { knob, width: ctx.width, audio: false }), ctx)) {
      best = knob
      lo = knob + 1
    } else hi = knob - 1
  }
  return best
}

/** One codec at every width, biggest last. */
async function rungs(enc, stem, codec, source, widths, knob, { keepTop, audio, loopVideo }) {
  const out = []
  for (const width of widths) {
    const copy = keepTop && width === widths.at(-1)
    const bytes = await enc.encode(source, copy ? { copy, audio } : { knob, width, audio, loopVideo })
    out.push({ width, bytes, name: `${stem}-${width}-${codec}-${short(bytes)}.${enc.ext}` })
  }
  const info = await onDisk(`x.${enc.ext}`, out.at(-1).bytes, file => enc.info(file))
  return { key: enc.key, type: sourceType(enc, info), rungs: out, size: out.at(-1).bytes.length }
}

async function encodersFor(o, encode) {
  const keys = [...new Set([...o.video.codecs.map(c => `video/${c}`), COMPATIBLE])]
  const found = []
  const diagnostics = []
  for (const key of keys) {
    const enc = encode[key]
    if (enc && (await enc.encoderName())) found.push(enc)
    else if (key === COMPATIBLE) return { error: enc ? null : need('Video', key), found, diagnostics }
    else diagnostics.push({ code: 'M019', severity: 'warning', message: `No encoder for ${key}: it is left out of the ladder.` })
  }
  return { found, diagnostics }
}

/** The poster, its dominant colour and the placeholder, from one frame. */
export async function poster(enc, source, stem, width, duration, o) {
  const png = await enc.still(source, { at: Math.min(1, duration / 10), width })
  const bytes = await sharp(png).webp({ quality: 80 }).toBuffer()
  const name = `${stem}-poster-${short(bytes)}.webp`
  const asset = { poster: name }
  if (o.placeholder) {
    const stats = await sharp(png).stats()
    asset.dominant = `#${['r', 'g', 'b'].map(c => stats.dominant[c].toString(16).padStart(2, '0')).join('')}`
    asset.placeholder = `data:image/webp;base64,${(await sharp(png).resize(16, 16, { fit: 'inside' }).webp({ quality: 40 }).toBuffer()).toString('base64')}`
  }
  return { asset, file: { name, bytes: new Uint8Array(bytes) } }
}

export const ladderOf = (o, width) => {
  const top = Math.min(width, o.video.widths.at(-1))
  return [...new Set([...o.video.widths.filter(w => w < top), top])]
}

async function encodeLadder(stem, source, info, o, encode, { widths, keepTop, audio, loopVideo, scorer }) {
  const { found, diagnostics, error } = await encodersFor(o, encode)
  if (error) return { error }
  const top = widths.at(-1)
  const { duration } = info
  const times = [0.05, 0.25, 0.45, 0.65, 0.85].map(f => Math.round(duration * f * 1000) / 1000)
  const ctx = { times, width: top, scorer, target: o.quality.target }
  const compatible = found.find(e => e.key === COMPATIBLE)
  const qualities = {}
  const sets = []
  for (const enc of [compatible, ...found.filter(e => e !== compatible)]) {
    const kept = keepTop && enc === compatible
    const knob = scorer && !kept ? await search(enc, source, ctx) : enc.knob.fixed
    qualities[enc.key.slice(6)] = knob
    sets.push(await rungs(enc, stem, enc.key.slice(6), source, widths, knob, { keepTop: kept, audio, loopVideo }))
  }
  return { sets, qualities, diagnostics }
}


/** Efficient sets first, H.264 last, dropping any that doesn't beat H.264 by 15%. */
function chosen(sets) {
  const [compatible, ...rest] = sets
  const winners = rest.filter(s => s.size <= compatible.size * SMALLER).sort((a, b) => a.size - b.size)
  return [...winners, compatible]
}

function finish(asset, sets, poster, diagnostics) {
  const files = sets.flatMap(s => s.rungs.map(r => ({ name: r.name, bytes: r.bytes })))
  if (poster) files.push(poster.file)
  const compatible = sets.at(-1)
  const top = compatible.rungs.at(-1)
  const out = { ...asset, ...poster?.asset, src: top.name, sources: sets.map(s => ({ type: s.type, srcset: s.rungs.map(r => `${r.name} ${r.width}w`).join(', ') })) }
  return { asset: out, files, diagnostics }
}

/** The compatible copy `encoder: 'compatible'` swaps in, and M014 with what it adds. */
function withCopy(out, o, name, copy) {
  if (o.encoder !== 'compatible' || !copy) return out
  const efficient = out.files.filter(f => f.name !== copy.src && /\.webm$/.test(f.name)).at(-1)?.bytes.length ?? copy.bytes
  out.asset.copy = { src: copy.src, type: copy.type, bytes: copy.bytes, ratio: Math.round((copy.bytes / efficient) * 100) / 100 }
  out.asset.swap = o.swap ?? 'intent'
  out.diagnostics.push({ code: 'M014', severity: 'info', message: `${name}: \`encoder: 'compatible'\` adds ${Math.round((copy.added ?? 0) / 1024)} KB for the compatible copy.` })
  return out
}

export async function video({ bytes, name, stem, audio }, o, encode, scorer) {
  const probe = encode[COMPATIBLE]
  if (!probe) return { asset: null, files: [], diagnostics: [need(name, COMPATIBLE)] }
  try {
    return await onDisk(name, bytes, async source => {
      const info = await probe.info(source)
      if (!info.video) return { asset: null, files: [], diagnostics: [{ code: 'M018', severity: 'error', message: `${name} has no video track.` }] }
      const { width, height, hdr, codec, pix } = info.video
      const widths = ladderOf(o, width)
      const keepTop = !audio && codec === 'h264' && pix === 'yuv420p' && widths.at(-1) === width && (!info.audio || info.audio.codec === 'aac')
      const built = await encodeLadder(stem, source, info, o, encode, { widths, keepTop, audio, scorer })
      if (built.error) return { asset: null, files: [], diagnostics: [built.error] }
      const sets = chosen(built.sets)
      const cover = await poster(probe, source, stem, widths.at(-1), info.duration, o)
      const diagnostics = built.diagnostics
      if (hdr) diagnostics.push({ code: 'M015', severity: 'warning', message: `${name} is HDR or over 8 bits, and comes out 8-bit SDR.` })
      const asset = { kind: 'video', width, height, type: 'video/mp4', name, quality: scorer ? 'ssimulacra2' : 'fixed', qualities: built.qualities, duration: info.duration, audio: !!(audio || info.audio) }
      const out = finish(asset, sets, cover, diagnostics)
      const top = sets.at(-1).rungs.at(-1)
      return withCopy(out, o, name, sets.length > 1 ? { src: top.name, type: 'video/mp4', bytes: top.bytes.length, added: 0 } : null)
    })
  } catch (e) {
    return errored(name, e)
  }
}

export async function audioFile({ bytes, name, stem }, o, encode) {
  const opus = encode['audio/opus']
  const aac = encode['audio/aac']
  if (!aac) return { asset: null, files: [], diagnostics: [need(name, 'audio/aac')] }
  try {
    return await onDisk(name, bytes, async source => {
      const info = await aac.info(source)
      if (!info.audio) return { asset: null, files: [], diagnostics: [{ code: 'M018', severity: 'error', message: `${name} has no audio track.` }] }
      const under = limit => !info.audio.bitrate || info.audio.bitrate <= limit
      const sets = []
      for (const [enc, codec, limit] of [[opus, 'opus', 96_000], [aac, 'aac', 128_000]]) {
        if (!enc || !(await enc.encoderName())) continue
        const encoded = await enc.encode(source, { copy: info.audio.codec === codec && under(limit) })
        const type = `${enc.ext === 'webm' ? 'audio/webm' : 'audio/mp4'}; codecs="${(await onDisk(`x.${enc.ext}`, encoded, f => enc.info(f))).audio.string}"`
        sets.push({ type, name: `${stem}-${short(encoded)}.${enc.ext}`, bytes: encoded })
      }
      const last = sets.at(-1)
      return {
        asset: { kind: 'audio', src: last.name, width: 0, height: 0, type: 'audio/mp4', name, quality: 'fixed', duration: info.duration, audio: true, sources: sets.map(s => ({ type: s.type, srcset: `${s.name} 1w` })) },
        files: sets.map(s => ({ name: s.name, bytes: s.bytes })),
        diagnostics: [],
      }
    })
  } catch (e) {
    return errored(name, e)
  }
}

/** Animated GIF: video when that's a real saving, animated WebP when it has transparency, else null (it stays a GIF). */
export async function gif({ bytes, name, stem, audio, meta, width, height }, o, encode, scorer) {
  const frames = meta.pages ?? 1
  const toVideo = o.gif?.toVideo ?? 'auto'
  if (toVideo === 'never' || !encode[COMPATIBLE]) return null
  const keep = o.gif?.keepUnder ?? 8192
  if (!audio && (bytes.length < keep || frames < 4)) return null
  const opaque = (await sharp(bytes, { animated: true }).stats()).isOpaque
  if (!opaque) return audio ? null : alphaWebp({ bytes, name, stem, width, height }, o)
  try {
    return await onDisk(name, bytes, async source => {
      const probe = encode[COMPATIBLE]
      const info = await probe.info(source)
      const delays = meta.delay ?? []
      const total = delays.length ? delays.reduce((a, b) => a + (b < 20 ? 100 : b), 0) / 1000 : info.duration
      const widths = ladderOf(o, width)
      const built = await encodeLadder(stem, source, { ...info, duration: total }, o, encode, { widths, audio, loopVideo: !!audio, scorer })
      if (built.error) return null
      const sets = chosen(built.sets)
      const smallest = Math.min(...sets.map(s => s.size))
      if (!audio && smallest > bytes.length * SMALLER) return null
      if (!audio) {
        const check = await onDisk(`x.${sets[0].rungs.at(-1).name.split('.').pop()}`, sets[0].rungs.at(-1).bytes, f => probe.info(f))
        if (Math.abs(check.duration - total) > Math.max(0.15, total * 0.05)) built.diagnostics.push({ code: 'M019', severity: 'warning', message: `${name}: the video runs ${check.duration} s, the GIF ${total} s.` })
      }
      const [winner, compatible] = sets.length > 1 ? [sets[0], sets.at(-1)] : [null, sets[0]]
      const served = winner ? [winner, compatible] : [compatible]
      const cover = await poster(probe, source, stem, widths.at(-1), total, o)
      const asset = { kind: 'video', width, height, type: 'video/mp4', name, quality: scorer ? 'ssimulacra2' : 'fixed', qualities: built.qualities, duration: total, audio: !!audio, animated: !audio, loop: meta.loop ?? 0 }
      const out = finish(asset, served, cover, built.diagnostics)
      if (o.encoder === 'compatible') {
        const original = `${stem}-${short(bytes)}.gif`
        out.files.push({ name: original, bytes })
        return withCopy(out, o, name, { src: original, type: 'image/gif', bytes: bytes.length, added: bytes.length })
      }
      return out
    })
  } catch (e) {
    return errored(name, e)
  }
}

async function alphaWebp({ bytes, name, stem, width, height }, o) {
  const webp = await sharp(bytes, { animated: true }).webp({ quality: 80, effort: 5 }).toBuffer()
  if (webp.length > bytes.length * SMALLER) return null
  const fileName = `${stem}-${short(webp)}.webp`
  const original = `${stem}-${short(bytes)}.gif`
  return {
    asset: { kind: 'graphic', src: original, width, height, type: 'image/gif', sources: [{ type: 'image/webp', srcset: `${fileName} ${width}w` }, { type: 'image/gif', srcset: `${original} ${width}w` }], name, quality: 'fixed', loop: 0 },
    files: [{ name: fileName, bytes: new Uint8Array(webp) }, { name: original, bytes }],
    diagnostics: [],
  }
}
