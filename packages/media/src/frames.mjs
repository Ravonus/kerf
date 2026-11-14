// Lossless image delivery is measured, not assumed smaller. Each chunk starts with a complete keyframe.
import sharp from 'sharp'
import { extname } from 'node:path'
import { onDisk } from './video/common.mjs'
import { losslessImages, pixelHash } from './lossless.mjs'

function changed(previous, current, width, height) {
  if (!previous) return { x: 0, y: 0, width, height }
  let left = width,
    right = -1,
    top = height,
    bottom = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      if (
        previous[offset] === current[offset] &&
        previous[offset + 1] === current[offset + 1] &&
        previous[offset + 2] === current[offset + 2] &&
        previous[offset + 3] === current[offset + 3]
      )
        continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = y
    }
  return right < left
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

class FrameOutput {
  chunks = []
  proofs = []
  spent = 0
  sampleEnd = 0
  count = 0
  refused = ''
  previous = undefined
  chunk = undefined
  constructor(files, source, o) {
    this.files = files
    this.source = source
    this.o = o
  }
  add(file) {
    if (!this.files.has(file.name)) {
      this.files.set(file.name, file)
      this.spent += file.bytes.length
    }
  }
  flush(end) {
    if (!this.chunk) return
    this.chunk.end = end
    const data = new TextEncoder().encode(JSON.stringify(this.chunk)),
      chunkName = `${this.source.stem}-chunk-${pixelHash(data).slice(0, 20)}.json`
    this.add({ name: chunkName, bytes: data })
    this.chunks.push({ start: this.chunk.start, end, src: chunkName })
    this.chunk = undefined
  }
  async patch(frame) {
    const { width, height, stem } = this.source,
      rect = changed(this.previous, frame.rgba, width, height)
    const entry = { time: frame.time, duration: frame.duration, x: 0, y: 0, width, height }
    if (!rect) return entry
    const raw = await sharp(frame.rgba, { raw: { width, height, channels: 4 } })
      .extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })
      .raw()
      .toBuffer()
    const candidates = await losslessImages(
        raw,
        rect.width,
        rect.height,
        this.o.formats,
        `${stem}-frame`,
      ),
      selected = candidates[0]
    Object.assign(entry, rect, { src: selected.name, type: selected.type })
    if (selected.type === 'image/avif') {
      const fallback =
        candidates.find((candidate) => candidate.type === 'image/webp') ??
        candidates.find((candidate) => candidate.type === 'image/png')
      entry.fallback = fallback.name
      this.add(fallback)
    }
    this.add(selected)
    return entry
  }
  async collect(reader) {
    const { width, height, bytes, duration } = this.source,
      limit = this.o.video.maxFrameBytes ?? 256 * 1024 * 1024,
      seconds = this.o.video.chunkSeconds ?? 2
    for await (const frame of reader.read({ width, height })) {
      if (!this.chunk || frame.time >= this.chunk.start + seconds) {
        this.flush(frame.time)
        this.chunk = { start: frame.time, end: 0, frames: [] }
        this.previous = undefined
      }
      this.chunk.frames.push(await this.patch(frame))
      this.previous = frame.rgba
      this.proofs.push(pixelHash(frame.rgba))
      this.count++
      this.sampleEnd = frame.time + frame.duration
      if (this.spent > limit) {
        this.refused = `the lossless frame output exceeds its ${limit}-byte budget`
        break
      }
      if (
        this.o.video.delivery === 'auto' &&
        this.sampleEnd >= Math.min(seconds, duration) &&
        this.spent > (bytes.length * this.sampleEnd) / duration
      ) {
        this.refused = 'measured lossless frames are larger than the source at the same duration'
        break
      }
    }
    if (!this.refused) this.flush(this.sampleEnd)
    this.previous = undefined
    return this
  }
}

function baselineVideo({ bytes, name, stem }, info, o) {
  const extension = extname(name).slice(1).toLowerCase(),
    type =
      extension === 'webm'
        ? 'video/webm'
        : extension === 'mov'
          ? 'video/quicktime'
          : extension === 'ogv'
            ? 'video/ogg'
            : extension === 'mkv'
              ? 'video/x-matroska'
              : 'video/mp4'
  const original = {
    src: `${stem}-original-${pixelHash(bytes).slice(0, 20)}.${extension}`,
    type,
    name,
    bytes: bytes.length,
  }
  return {
    kind: 'video',
    src: original.src,
    width: info.video.width,
    height: info.video.height,
    type,
    name,
    quality: 'original',
    duration: info.duration,
    audio: !!info.audio,
    sources: [{ type, srcset: `${original.src} ${info.video.width}w` }],
    original,
    copy: { src: original.src, type, bytes: bytes.length },
    swap: o.swap ?? 'intent',
  }
}

async function audioTrack(provider, file, info, stem, files) {
  if (!info.audio) return undefined
  if (!provider.copyAudio)
    throw new Error('Frame delivery needs copyAudio() to retain the source audio')
  const track = await provider.copyAudio(file, info.audio.codec),
    audioName = `${stem}-audio-${pixelHash(track.bytes).slice(0, 20)}.${track.ext}`
  files.set(audioName, { name: audioName, bytes: track.bytes })
  return { src: audioName, type: track.type, offset: 0 }
}

function refusedOutput(baseline, files, built, o) {
  const severity = o.video.delivery === 'frames' ? 'error' : 'info'
  return {
    asset: severity === 'error' ? null : baseline,
    files: [files.get(baseline.src), files.get(baseline.poster)],
    diagnostics: [
      {
        code: 'M020',
        severity,
        message: `${baseline.name}: ${built.refused}; the unchanged original remains available. Sample: ${built.spent} frame bytes in ${built.sampleEnd.toFixed(3)}s.`,
      },
    ],
    verification: {
      frameBytes: built.spent,
      sampledSeconds: built.sampleEnd,
      originalBytes: baseline.original.bytes,
      pixels: 'exact',
      selected: 'original',
    },
  }
}

/** Public media.build's frame path: exact image patches, source times and optional unchanged encoded audio. */
export async function frameVideo(source, o, encode) {
  const provider = encode['video/h264']
  if (!provider?.frames)
    return {
      asset: null,
      files: [],
      diagnostics: [
        {
          code: 'M020',
          severity: 'error',
          message: `${source.name}: frame delivery needs the current mediaFfmpeg() provider with frames().`,
        },
      ],
    }
  return onDisk(source.name, source.bytes, async (file) => {
    const info = await provider.info(file)
    if (!info.video || info.video.hdr)
      return {
        asset: null,
        files: [],
        diagnostics: [
          {
            code: 'M020',
            severity: 'error',
            message: `${source.name}: frame delivery cannot qualify HDR or an absent video track; the original is retained.`,
          },
        ],
      }
    const baseline = baselineVideo(source, info, o),
      files = new Map([[baseline.src, { name: baseline.src, bytes: source.bytes }]])
    const posterBytes = await provider.still(file, { at: 0, width: Math.min(baseline.width, 960) }),
      poster = `${source.stem}-poster-${pixelHash(posterBytes).slice(0, 20)}.png`
    files.set(poster, { name: poster, bytes: posterBytes })
    baseline.poster = poster
    const reader = await provider.frames(file),
      built = await new FrameOutput(
        files,
        { ...source, width: baseline.width, height: baseline.height, duration: info.duration },
        o,
      ).collect(reader)
    if (built.refused) return refusedOutput(baseline, files, built, o)
    const audio = await audioTrack(provider, file, info, source.stem, files)
    return {
      asset: {
        ...baseline,
        frames: { version: 1, chunks: built.chunks, pixels: 'exact', ...(audio && { audio }) },
      },
      files: [...files.values()],
      diagnostics: [],
      verification: {
        pixels: 'exact',
        frameCount: built.count,
        frameHashesSha256: pixelHash(built.proofs.join('\n')),
        frameBytes: built.spent,
        originalBytes: source.bytes.length,
        audio: info.audio ? 'stream-copy' : 'absent',
      },
    }
  })
}
