// Video, audio and GIF-to-video for media.build@1 (research 15 §3.3–3.4), through whichever providers media.encode@1
// has bound (`@kerf-js/media-ffmpeg`).
//   Keep what is already delivered: an H.264 source at or under the top width is remuxed, not re-encoded, and an
//   efficient codec has to beat the H.264 file by 15% to ship (re-encoding a lossy source can't win at a fixed target).
//   Quality: a CRF search at the top width, sampled SSIMULACRA2 frames with mean ≥ target and worst frame ≥ target − 5.
//   A mean alone lets AV1 hide ugly frames (research 15 measured 55 inside an 80 mean). No scorer: fixed CRFs.
//   GIFs stay GIFs under 8 KB, under 4 frames, with real transparency (H.264 has no alpha; animated WebP does), or when
//   nothing is 15% smaller. Noisy GIFs came out 70–180% larger as video.
import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { errored, need, onDisk, short } from './video/common.mjs'
import { withPlaceholder } from './shared.mjs'

export { audioFile } from './video/audio.mjs'

const run = promisify(execFile)
export const VIDEO = /\.(mp4|m4v|mov|webm|mkv|ogv)$/i
export const AUDIO = /\.(mp3|wav|flac|ogg|oga|opus|m4a|aac)$/i
const SMALLER = 0.85
const COMPATIBLE = 'video/h264'
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
    return (
      scores.reduce((a, b) => a + b) / scores.length >= ctx.target &&
      Math.min(...scores) >= ctx.target - 5
    )
  })
}

/** The highest CRF that passes, within 4 encodes. Video-only: audio has its own bitrate. */
async function search(enc, source, ctx) {
  let { min: lo, max: hi } = enc.knob
  let best = lo
  for (let i = 0; i < 4 && lo <= hi; i++) {
    const knob = Math.round((lo + hi) / 2)
    if (
      await passes(
        enc,
        source,
        await enc.encode(source, { knob, width: ctx.width, audio: false }),
        ctx,
      )
    ) {
      best = knob
      lo = knob + 1
    } else hi = knob - 1
  }
  return best
}

/** One codec at every width, biggest last. */
async function rungs({ enc, stem, codec, source, widths, knob, keepTop, audio, loopVideo }) {
  const out = []
  for (const width of widths) {
    const copy = keepTop && width === widths.at(-1)
    const bytes = await enc.encode(
      source,
      copy ? { copy, audio } : { knob, width, audio, loopVideo },
    )
    out.push({ width, bytes, name: `${stem}-${width}-${codec}-${short(bytes)}.${enc.ext}` })
  }
  const info = await onDisk(`x.${enc.ext}`, out.at(-1).bytes, (file) => enc.info(file))
  return { key: enc.key, type: sourceType(enc, info), rungs: out, size: out.at(-1).bytes.length }
}

async function encodersFor(o, encode) {
  const keys = [...new Set([...o.video.codecs.map((c) => `video/${c}`), COMPATIBLE])]
  const found = []
  const diagnostics = []
  for (const key of keys) {
    const enc = encode[key]
    if (enc && (await enc.encoderName())) found.push(enc)
    else if (key === COMPATIBLE)
      return { error: enc ? null : need('Video', key), found, diagnostics }
    else
      diagnostics.push({
        code: 'M019',
        severity: 'warning',
        message: `No encoder for ${key}: it is left out of the ladder.`,
      })
  }
  return { found, diagnostics }
}

/** The poster, its dominant colour and the placeholder, from one frame. */
export async function poster({ enc, source, stem, width, duration, o }) {
  const png = await enc.still(source, { at: Math.min(1, duration / 10), width })
  const bytes = await sharp(png).webp({ quality: 80 }).toBuffer()
  const name = `${stem}-poster-${short(bytes)}.webp`
  const asset = { poster: name }
  const files = [{ name, bytes: new Uint8Array(bytes) }]
  if (o.placeholder) {
    const stats = await sharp(png).stats()
    asset.dominant = `#${['r', 'g', 'b'].map((c) => stats.dominant[c].toString(16).padStart(2, '0')).join('')}`
    await withPlaceholder(asset, files, sharp(png), stem, o)
  }
  return { asset, files }
}

export const ladderOf = (o, width) => {
  const top = Math.min(width, o.video.widths.at(-1))
  return [...new Set([...o.video.widths.filter((w) => w < top), top])]
}

async function encodeLadder({
  stem,
  source,
  info,
  o,
  encode,
  widths,
  keepTop,
  audio,
  loopVideo,
  scorer,
}) {
  const { found, diagnostics, error } = await encodersFor(o, encode)
  if (error) return { error }
  const top = widths.at(-1)
  const { duration } = info
  const times = [0.05, 0.25, 0.45, 0.65, 0.85].map((f) => Math.round(duration * f * 1000) / 1000)
  const ctx = { times, width: top, scorer, target: o.quality.target }
  const compatible = found.find((e) => e.key === COMPATIBLE)
  const qualities = {}
  const sets = []
  for (const enc of [compatible, ...found.filter((e) => e !== compatible)]) {
    const kept = keepTop && enc === compatible
    const knob = scorer && !kept ? await search(enc, source, ctx) : enc.knob.fixed
    qualities[enc.key.slice(6)] = knob
    sets.push(
      await rungs({
        enc,
        stem,
        codec: enc.key.slice(6),
        source,
        widths,
        knob,
        keepTop: kept,
        audio,
        loopVideo,
      }),
    )
  }
  return { sets, qualities, diagnostics }
}

/** Efficient sets first, H.264 last, dropping any that doesn't beat H.264 by 15%. */
function chosen(sets) {
  const [compatible, ...rest] = sets
  const winners = rest
    .filter((s) => s.size <= compatible.size * SMALLER)
    .sort((a, b) => a.size - b.size)
  return [...winners, compatible]
}

function finish(asset, sets, cover, diagnostics) {
  const files = sets.flatMap((s) => s.rungs.map((r) => ({ name: r.name, bytes: r.bytes })))
  if (cover) files.push(...cover.files)
  const compatible = sets.at(-1)
  const top = compatible.rungs.at(-1)
  const out = {
    ...asset,
    ...cover?.asset,
    src: top.name,
    sources: sets.map((s) => ({
      type: s.type,
      srcset: s.rungs.map((r) => `${r.name} ${r.width}w`).join(', '),
    })),
  }
  return { asset: out, files, diagnostics }
}

/** The compatible copy `encoder: 'compatible'` swaps in, and M014 with what it adds. */
function withCopy(out, o, name, copy) {
  if (o.encoder !== 'compatible' || !copy) return out
  const efficient =
    out.files.filter((f) => f.name !== copy.src && f.name.endsWith('.webm')).at(-1)?.bytes.length ??
    copy.bytes
  out.asset.copy = {
    src: copy.src,
    type: copy.type,
    bytes: copy.bytes,
    ratio: Math.round((copy.bytes / efficient) * 100) / 100,
  }
  out.asset.swap = o.swap ?? 'intent'
  out.diagnostics.push({
    code: 'M014',
    severity: 'info',
    message: `${name}: \`encoder: 'compatible'\` adds ${Math.round((copy.added ?? 0) / 1024)} KB for the compatible copy.`,
  })
  return out
}

export async function video({ bytes, name, stem, audio }, o, encode, scorer) {
  const probe = encode[COMPATIBLE]
  if (!probe) return { asset: null, files: [], diagnostics: [need(name, COMPATIBLE)] }
  try {
    return await onDisk(name, bytes, async (source) => {
      const info = await probe.info(source)
      if (!info.video)
        return {
          asset: null,
          files: [],
          diagnostics: [
            { code: 'M018', severity: 'error', message: `${name} has no video track.` },
          ],
        }
      const { width, height, hdr, codec, pix } = info.video
      const widths = ladderOf(o, width)
      const keepTop =
        !audio &&
        codec === 'h264' &&
        pix === 'yuv420p' &&
        widths.at(-1) === width &&
        (!info.audio || info.audio.codec === 'aac')
      const built = await encodeLadder({
        stem,
        source,
        info,
        o,
        encode,
        widths,
        keepTop,
        audio,
        scorer,
      })
      if (built.error) return { asset: null, files: [], diagnostics: [built.error] }
      const sets = chosen(built.sets)
      const cover = await poster({
        enc: probe,
        source,
        stem,
        width: widths.at(-1),
        duration: info.duration,
        o,
      })
      const diagnostics = built.diagnostics
      if (hdr)
        diagnostics.push({
          code: 'M015',
          severity: 'warning',
          message: `${name} is HDR or over 8 bits, and comes out 8-bit SDR.`,
        })
      const asset = {
        kind: 'video',
        width,
        height,
        type: 'video/mp4',
        name,
        quality: scorer ? 'ssimulacra2' : 'fixed',
        qualities: built.qualities,
        duration: info.duration,
        audio: !!(audio || info.audio),
      }
      const out = finish(asset, sets, cover, diagnostics)
      const top = sets.at(-1).rungs.at(-1)
      return withCopy(
        out,
        o,
        name,
        sets.length > 1
          ? { src: top.name, type: 'video/mp4', bytes: top.bytes.length, added: 0 }
          : null,
      )
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
  if (!opaque) return audio ? null : alphaWebp({ bytes, name, stem, width, height })
  try {
    return await onDisk(name, bytes, async (source) => {
      const probe = encode[COMPATIBLE]
      const info = await probe.info(source)
      const delays = meta.delay ?? []
      const total = delays.length
        ? delays.reduce((a, b) => a + (b < 20 ? 100 : b), 0) / 1000
        : info.duration
      const widths = ladderOf(o, width)
      const built = await encodeLadder({
        stem,
        source,
        info: { ...info, duration: total },
        o,
        encode,
        widths,
        audio,
        loopVideo: !!audio,
        scorer,
      })
      if (built.error) return null
      const sets = chosen(built.sets)
      const smallest = Math.min(...sets.map((s) => s.size))
      if (!audio && smallest > bytes.length * SMALLER) return null
      if (!audio) await checkRuntime(probe, sets, total, name, built.diagnostics)
      const [winner, compatible] = sets.length > 1 ? [sets[0], sets.at(-1)] : [null, sets[0]]
      const served = winner ? [winner, compatible] : [compatible]
      const cover = await poster({
        enc: probe,
        source,
        stem,
        width: widths.at(-1),
        duration: total,
        o,
      })
      const asset = {
        kind: 'video',
        width,
        height,
        type: 'video/mp4',
        name,
        quality: scorer ? 'ssimulacra2' : 'fixed',
        qualities: built.qualities,
        duration: total,
        audio: !!audio,
        animated: !audio,
        loop: meta.loop ?? 0,
      }
      const out = finish(asset, served, cover, built.diagnostics)
      if (o.encoder === 'compatible') {
        const original = `${stem}-${short(bytes)}.gif`
        out.files.push({ name: original, bytes })
        return withCopy(out, o, name, {
          src: original,
          type: 'image/gif',
          bytes: bytes.length,
          added: bytes.length,
        })
      }
      return out
    })
  } catch (e) {
    return errored(name, e)
  }
}

async function checkRuntime(probe, sets, total, name, diagnostics) {
  const top = sets[0].rungs.at(-1)
  const check = await onDisk(`x.${top.name.split('.').pop()}`, top.bytes, (f) => probe.info(f))
  if (Math.abs(check.duration - total) > Math.max(0.15, total * 0.05))
    diagnostics.push({
      code: 'M019',
      severity: 'warning',
      message: `${name}: the video runs ${check.duration} s, the GIF ${total} s.`,
    })
}

async function alphaWebp({ bytes, name, stem, width, height }) {
  const webp = await sharp(bytes, { animated: true }).webp({ quality: 80, effort: 5 }).toBuffer()
  if (webp.length > bytes.length * SMALLER) return null
  const fileName = `${stem}-${short(webp)}.webp`
  const original = `${stem}-${short(bytes)}.gif`
  return {
    asset: {
      kind: 'graphic',
      src: original,
      width,
      height,
      type: 'image/gif',
      sources: [
        { type: 'image/webp', srcset: `${fileName} ${width}w` },
        { type: 'image/gif', srcset: `${original} ${width}w` },
      ],
      name,
      quality: 'fixed',
      loop: 0,
    },
    files: [
      { name: fileName, bytes: new Uint8Array(webp) },
      { name: original, bytes },
    ],
    diagnostics: [],
  }
}
