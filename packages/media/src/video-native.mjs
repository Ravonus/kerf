// The automatic path never treats a fixed CRF as measured quality, or silently transcodes audio.
import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { baselineVideo } from './frames.mjs'
import { pixelHash } from './lossless.mjs'
import { onDisk } from './video/common.mjs'
import { poster } from './video.mjs'

const run = promisify(execFile)
const fractions = [0.05, 0.25, 0.45, 0.65, 0.85]

async function quality(enc, encoded, ctx) {
  const { source } = ctx
  return onDisk(`candidate.${enc.native.ext}`, encoded, async (file, dir) => {
    const scores = []
    const times = ctx.timeline.filter((frame) => frame[0] < ctx.duration)
    for (const at of fractions.map(
      (fraction) => times[Math.min(times.length - 1, Math.floor(fraction * times.length))][0],
    )) {
      const ref = join(dir, 'reference.png'),
        out = join(dir, 'decoded.png')
      writeFileSync(ref, await enc.still(source, { at }))
      writeFileSync(out, await enc.still(file, { at }))
      scores.push(
        parseFloat((await run(ctx.scorer, [ref, out], { timeout: 30000, maxBuffer: 4096 })).stdout),
      )
    }
    const minimum = Math.min(...scores)
    return {
      metric: 'ssimulacra2',
      target: ctx.target,
      minimum,
      samples: scores.length,
      passed: scores.every((score) => Number.isFinite(score) && score >= ctx.target),
    }
  })
}

async function search(enc, source, ctx) {
  let lo = 0,
    hi = enc.knob.max,
    best
  const sample = { ...ctx, duration: Math.min(ctx.duration, 2) }
  for (let index = 0; index < 5 && lo <= hi; index++) {
    const knob = Math.floor((lo + hi) / 2),
      bytes = await enc.native.encode(source, { knob, seconds: sample.duration })
    if ((await quality(enc, bytes, { ...sample, source })).passed) {
      best = knob
      lo = knob + 1
    } else hi = knob - 1
  }
  return best
}

function sameTimeline(source, candidate) {
  return (
    source.width === candidate.width &&
    source.height === candidate.height &&
    source.audio === candidate.audio &&
    source.audioStart === candidate.audioStart &&
    source.timeline.length === candidate.timeline.length &&
    Math.abs(source.duration - candidate.duration) <= 0.002 &&
    source.timeline.every((frame, index) =>
      frame.every((time, part) => Math.abs(time - candidate.timeline[index][part]) <= 0.00051),
    )
  )
}

async function qualify(enc, bytes, { reference, copy }) {
  return onDisk(`candidate.${enc.native.ext}`, bytes, async (candidate) => {
    const proof = await enc.native.fingerprint(candidate),
      info = await enc.info(candidate)
    if (!sameTimeline(reference, proof) || (copy && reference.video !== proof.video))
      throw new Error('Candidate changed frame timing, geometry or encoded audio')
    return {
      timing: 'complete',
      frameCount: proof.timeline.length,
      audio: proof.audio ? 'identical encoded samples' : 'absent',
      video: copy ? 'identical encoded samples' : 'sampled perceptual quality',
      type: `${enc.native.type}; codecs="${[info.video?.string, info.audio?.string].filter(Boolean).join(', ')}"`,
      timelineSha256: proof.sha256,
    }
  })
}

function install(out, candidate, source) {
  const name = `${source.stem}-native-${pixelHash(candidate.bytes).slice(0, 20)}.${candidate.enc.native.ext}`
  const type = candidate.proof.type
  out.asset.sources.unshift({ type, srcset: `${name} ${out.asset.width}w` })
  if (candidate.enc.key === 'video/h264') {
    out.asset.src = name
    out.asset.type = candidate.enc.native.type
  }
  if (candidate.quality) out.asset.quality = 'ssimulacra2'
  out.files.push({ name, bytes: candidate.bytes })
  out.verification = {
    ...candidate.proof,
    selected: 'native',
    quality: candidate.quality,
    playbackBytes: candidate.bytes.length,
    originalBytes: source.bytes.length,
  }
}

async function evaluate(enc, ctx) {
  const { key, copy, info, o, scorer, file, reference, ceiling } = ctx
  const assessment = { codec: key, mode: copy ? 'container' : 'encode', status: 'unavailable' }
  if (!enc?.native) return { assessment }
  if (!enc.native.acceptsAudio(info.audio?.codec))
    return { assessment: { ...assessment, status: 'unsupported audio container' } }
  if (!copy && ((o.video.lossless ?? o.quality.lossless) || !scorer || !(await enc.encoderName())))
    return { assessment: { ...assessment, status: 'encoding policy or scorer unavailable' } }
  const target = {
      scorer,
      target: o.quality.target,
      duration: info.duration,
      timeline: reference.timeline,
    },
    knob = copy ? undefined : await search(enc, file, target)
  if (!copy && knob === undefined)
    return { assessment: { ...assessment, status: 'quality search failed' } }
  const bytes = await enc.native.encode(file, { copy, knob })
  assessment.bytes = bytes.length
  if (bytes.length + 1024 >= ceiling)
    return { assessment: { ...assessment, status: 'no delivery byte saving' } }
  const measured = copy ? undefined : await quality(enc, bytes, { ...target, source: file })
  if (measured && !measured.passed)
    return { assessment: { ...assessment, status: 'final quality failed', quality: measured } }
  const proof = await qualify(enc, bytes, { reference, copy })
  return {
    assessment: { ...assessment, status: 'qualified', quality: measured },
    candidate: { enc, bytes, proof, quality: measured },
  }
}

async function candidates({ source, file, info, out, encode, o, scorer }) {
  const probe = encode['video/h264']
  if (info.video.hdr || /yuva|rgba|bgra|gbrap/.test(info.video.pix) || !probe.native) return out
  const reference = await probe.native.fingerprint(file),
    recipes = [
      { key: `video/${info.video.codec}`, copy: true },
      ...[...new Set([...o.video.codecs.map((key) => `video/${key}`), 'video/h264'])].map(
        (key) => ({ key, copy: false }),
      ),
    ],
    assessments = []
  let best
  for (const { key, copy } of recipes) {
    try {
      const result = await evaluate(encode[key], {
        key,
        copy,
        file,
        info,
        o,
        scorer,
        reference,
        ceiling: best?.bytes.length ?? source.bytes.length,
      })
      assessments.push(result.assessment)
      if (result.candidate) best = result.candidate
    } catch (error) {
      assessments.push({
        codec: key,
        mode: copy ? 'container' : 'encode',
        status: 'error',
        reason: error.message,
      })
      out.diagnostics.push({
        code: 'M020',
        severity: 'info',
        message: `${source.name}: ${key} candidate retained its source: ${error.message}`,
      })
    }
  }
  if (best) install(out, best, source)
  out.verification.nativeCandidates = assessments
  return out
}

/** Compare qualified full-resolution native codecs and packet-preserving containers with the original. */
export async function nativeVideo(source, o, encode, scorer) {
  const probe = encode['video/h264']
  if (!probe) return null
  return onDisk(source.name, source.bytes, async (file) => {
    const info = await probe.info(file)
    if (!info.video) return null
    const asset = baselineVideo(source, info, o),
      cover = await poster({
        enc: probe,
        source: file,
        stem: source.stem,
        width: Math.min(info.video.width, 640),
        duration: info.duration,
        o,
      }),
      out = {
        asset: { ...asset, ...cover.asset },
        files: [{ name: asset.src, bytes: source.bytes }, ...cover.files],
        diagnostics: [],
        verification: {
          selected: 'original',
          originalBytes: source.bytes.length,
          playbackBytes: source.bytes.length,
        },
      }
    try {
      return await candidates({ source, file, info, out, encode, o, scorer })
    } catch (error) {
      out.verification.framesEligible = false
      out.diagnostics.push({
        code: 'M020',
        severity: 'info',
        message: `${source.name}: ${error.message}; original retained.`,
      })
      return out
    }
  })
}
