// Video, audio and GIF-to-video on real encodes through @weft/plugin-media-ffmpeg: the ladder, what's kept, GIF delays,
// the keep-the-GIF rule, audio muxing and the compatible copy. Skipped where ffmpeg isn't installed.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMediaEncode } from '@weft/plugin-media-ffmpeg/build'
import { KEYS } from '@weft/plugin-media-ffmpeg'
import { createMediaBuild, findScorer } from '../src/build.mjs'
import { createMediaServer } from '../src/server.mjs'

const hasFfmpeg = !spawnSync('ffmpeg', ['-version']).error
const encode = Object.fromEntries(KEYS.map(key => [key, createMediaEncode({ key })]))
const options = { quality: { scorer: 'none' }, video: { widths: [160, 320] } }
let dir
const ff = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
const read = name => new Uint8Array(execFileSync('cat', [join(dir, name)], { maxBuffer: 1 << 28 }))
const build = (name, opts = options, extra = {}) => createMediaBuild(opts).build({ file: join(dir, name), bytes: read(name), ...extra }, { cacheDir: mkdtempSync(join(dir, 'c-')), encode })
const info = (name, bytes) => {
  const file = join(dir, `probe-${name}`)
  writeFileSync(file, bytes)
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-count_frames', '-of', 'json', file]))
}
/** A flat UI-like animation in a GIF: compresses far better as video. */
async function flatGif(name, delay) {
  const frames = 24
  const width = 320
  const height = 180
  const px = Buffer.alloc(width * height * frames * 3, 255)
  for (let f = 0; f < frames; f++) for (let y = 40; y < 140; y++) for (let x = 0; x < 60; x++) {
    const i = (f * height + y) * width * 3 + (x + f * 10) * 3
    px[i] = 30; px[i + 1] = 90; px[i + 2] = 200
  }
  writeFileSync(join(dir, name), await sharp(px, { raw: { width, height: height * frames, channels: 3, pageHeight: height } }).gif({ delay, loop: 0, effort: 1 }).toBuffer())
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'weft-video-'))
  if (!hasFfmpeg) return
  ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=2:r=24', '-f', 'lavfi', '-i', 'sine=f=440:d=2', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', join(dir, 'clip.mov'))
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=1:r=24', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '30', '-movflags', '+faststart', join(dir, 'web.mp4'))
  ff('-f', 'lavfi', '-i', 'sine=f=440:d=3', join(dir, 'tone.wav'))
  ff('-f', 'lavfi', '-i', 'sine=f=330:d=3', '-c:a', 'libopus', '-b:a', '48k', join(dir, 'beat.opus'))
  await flatGif('flat.gif', 80)
  await flatGif('steps.gif', Array.from({ length: 24 }, (_, i) => (i % 2 ? 40 : 120)))
}, 60000)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe.skipIf(!hasFfmpeg)('video', () => {
  it('encodes a ladder, efficient first, H.264 last, with a poster, and keeps the audio', async () => {
    const { asset, files } = await build('clip.mov')
    expect(asset).toMatchObject({ kind: 'video', width: 640, height: 360, type: 'video/mp4', audio: true, quality: 'fixed' })
    expect(asset.sources.at(-1).type).toMatch(/^video\/mp4; codecs="avc1\.\w+, mp4a\.40\.2"$/)
    expect(asset.sources.at(-1).srcset).toMatch(/160w, .*320w$/)
    expect(asset.poster).toMatch(/\.webp$/)
    const top = files.find(f => f.name === asset.src)
    const probed = info('top.mp4', top.bytes)
    expect(probed.streams.map(s => s.codec_name).sort()).toEqual(['aac', 'h264'])
    expect(probed.streams.find(s => s.codec_type === 'video').width).toBe(320)
    expect(Buffer.from(top.bytes).indexOf('moov')).toBeLessThan(Buffer.from(top.bytes).indexOf('mdat')) // +faststart
  })

  it('keeps H.264 already at its width: the top rung is the same stream', async () => {
    const { asset, files } = await build('web.mp4')
    const top = files.find(f => f.name === asset.src)
    const a = info('a.mp4', top.bytes).streams[0]
    const b = info('b.mp4', read('web.mp4')).streams[0]
    expect([a.nb_read_frames, a.bit_rate]).toEqual([b.nb_read_frames, b.bit_rate])
  })

  it('refuses without a provider, naming the fix', async () => {
    const out = await createMediaBuild(options).build({ file: join(dir, 'clip.mov'), bytes: read('clip.mov') }, { cacheDir: mkdtempSync(join(dir, 'c-')) })
    expect(out.diagnostics[0]).toMatchObject({ code: 'P101', severity: 'error' })
    expect(out.diagnostics[0].message).toContain('mediaFfmpeg()')
  })

  it('background: H.264 is the copy, and M014 says what it adds', async () => {
    const { asset, diagnostics } = await build('clip.mov', { ...options, encoder: 'compatible', swap: 'idle' })
    if (asset.sources.length < 2) return // AV1 lost the 15% rule on this clip: nothing to swap
    expect(asset.copy).toMatchObject({ src: asset.src, type: 'video/mp4' })
    expect(asset.swap).toBe('idle')
    expect(diagnostics.map(d => d.code)).toContain('M014')
  })
})

describe.skipIf(!hasFfmpeg)('GIF', () => {
  it('turns into video when that saves 15%, looping, with its running time', async () => {
    const { asset, files } = await build('flat.gif')
    expect(asset).toMatchObject({ kind: 'video', animated: true, audio: false, loop: 0, width: 320, height: 180 })
    expect(Math.abs(asset.duration - Number(info('f.gif', read('flat.gif')).format.duration))).toBeLessThan(0.15)
    expect(files.find(f => f.name === asset.src).bytes.length).toBeLessThan(read('flat.gif').length * 0.85)
  })

  it('keeps variable delays', async () => {
    const { asset, files } = await build('steps.gif')
    const s = info('steps.mp4', files.find(f => f.name === asset.src).bytes)
    expect(Number(s.format.duration)).toBeCloseTo(12 * 0.04 + 12 * 0.12, 0)
    expect(Number(s.streams[0].nb_read_frames)).toBe(24)
  })

  it('background: the original GIF is the copy', async () => {
    const { asset, files } = await build('flat.gif', { ...options, encoder: 'compatible' })
    expect(asset.copy.type).toBe('image/gif')
    expect(files.find(f => f.name === asset.copy.src).bytes).toEqual(read('flat.gif'))
  })

  it.skipIf(!findScorer('ssimulacra2'))('stays a GIF when nothing is 15% smaller at the target', async () => {
    ff('-f', 'lavfi', '-i', 'nullsrc=s=160x90:r=10:d=1,geq=random(1)*255:random(2)*255:random(3)*255', '-vf', 'split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none', join(dir, 'noise.gif'))
    const { asset } = await build('noise.gif', { ...options, quality: { scorer: 'ssimulacra2' }, gif: { keepUnder: 0 } })
    expect(asset.type).toBe('image/gif')
    expect(asset.kind).toBe('graphic')
  })

  it('stays a GIF with `toVideo: never` and without a provider', async () => {
    expect((await build('flat.gif', { ...options, gif: { toVideo: 'never' } })).asset.kind).toBe('graphic')
    const none = await createMediaBuild(options).build({ file: join(dir, 'flat.gif'), bytes: read('flat.gif') }, { cacheDir: mkdtempSync(join(dir, 'c-')) })
    expect(none.asset.kind).toBe('graphic')
  })

  it('never makes H.264 of a transparent GIF', async () => {
    const width = 64
    const height = 64
    const frames = 8
    const px = Buffer.alloc(width * height * frames * 4)
    for (let i = 0; i < px.length; i += 4) if ((i / 4) % 7 < 2) px.fill(200, i, i + 4)
    writeFileSync(join(dir, 'alpha.gif'), await sharp(px, { raw: { width, height: height * frames, channels: 4, pageHeight: height } }).gif({ delay: 50 }).toBuffer())
    const { asset } = await build('alpha.gif', { ...options, gif: { keepUnder: 0 } })
    expect(asset.kind).toBe('graphic')
    expect(asset.sources.flatMap(s => s.type)).not.toContain('video/mp4')
  })

  it('muxes `audio=`: the GIF loops for the length of the sound', async () => {
    const { asset, files } = await build('flat.gif', options, { audio: join(dir, 'beat.opus') })
    expect(asset).toMatchObject({ kind: 'video', audio: true, animated: false })
    const s = info('mux.mp4', files.find(f => f.name === asset.src).bytes)
    expect(s.streams.map(t => t.codec_name).sort()).toEqual(['aac', 'h264'])
    expect(Number(s.format.duration)).toBeCloseTo(3, 0)
  })
})

describe.skipIf(!hasFfmpeg)('audio', () => {
  it('gives Opus and AAC', async () => {
    const { asset, files } = await build('tone.wav')
    expect(asset).toMatchObject({ kind: 'audio', audio: true })
    expect(asset.duration).toBeCloseTo(3, 1)
    expect(asset.sources.map(s => s.type)).toEqual(['audio/webm; codecs="opus"', 'audio/mp4; codecs="mp4a.40.2"'])
    expect(files.length).toBe(2)
  })

  it('remuxes Opus already under the bitrate instead of re-encoding', async () => {
    const { asset, files } = await build('beat.opus')
    const opus = files.find(f => f.name.endsWith('.webm'))
    expect(asset.kind).toBe('audio')
    expect(Number(info('o.webm', opus.bytes).format.bit_rate)).toBeLessThan(90_000)
  })
})

describe.skipIf(!hasFfmpeg)('uploads', () => {
  const upload = opts => createMediaServer({ ...options, ...opts, server: { dir: mkdtempSync(join(dir, 's-')) } }).at('/unused', encode)
  const want = (m, u) => {
    const [, hash, width, format] = /\/m\/(\w+)\/(\d+)\.(\w+)/.exec(u.split(' ')[0])
    return m.serve({ hash, width: Number(width), format, accept: '' })
  }

  it('answers with the record at once, stands in the playable original, then serves the rungs for good', async () => {
    const m = upload()
    const asset = await m.ingest(read('web.mp4'), { name: 'web.mp4' })
    expect(asset).toMatchObject({ kind: 'video', width: 320, height: 180, audio: false })
    expect(asset.poster).toMatch(/\/0\.webp$/)
    expect((await want(m, asset.poster)).type).toBe('image/webp')
    const small = asset.sources.at(-1).srcset.split(', ')[0]
    const early = await want(m, small)
    expect(early.temporary).toBe(true)
    await m.settled()
    const done = await want(m, small)
    expect(done.temporary).toBeUndefined()
    expect(info('rung.mp4', done.bytes).streams[0].width).toBe(160)
    expect(await want(m, asset.src.replace('.mp4', '.webm'))).toBeNull() // kept H.264: nothing efficient to gain, no URL
  })

  it('waits for the encode when browsers can\'t play the original, and a restart loses nothing', async () => {
    const s = mkdtempSync(join(dir, 's-'))
    const first = createMediaServer({ ...options, server: { dir: s } }).at('/unused', encode)
    const asset = await first.ingest(read('clip.mov'), { name: 'clip.mov' })
    await first.settled()
    const again = createMediaServer({ ...options, server: { dir: s } }).at('/unused', encode)
    const out = await want(again, asset.src)
    expect(out.temporary).toBeUndefined()
    expect(info('up.mp4', out.bytes).streams.map(t => t.codec_name).sort()).toEqual(['aac', 'h264'])
  })

  it('takes audio, whatever the file is called', async () => {
    const m = upload()
    const asset = await m.ingest(read('tone.wav'), { name: 'renamed.bin' })
    expect(asset).toMatchObject({ kind: 'audio', audio: true })
    expect((await want(m, asset.src)).type).toBe('audio/mp4')
  })

  it('turns a GIF into video when that saves 15%, with the GIF as the compatible copy', async () => {
    const m = upload({ encoder: 'compatible' })
    const asset = await m.ingest(read('flat.gif'), { name: 'flat.gif' })
    expect(asset).toMatchObject({ kind: 'video', animated: true, width: 320, height: 180 })
    expect(new Uint8Array((await want(m, asset.copy.src)).bytes)).toEqual(read('flat.gif'))
  })

  it('refuses video with no provider, naming the fix', async () => {
    const m = createMediaServer({ ...options, server: { dir: mkdtempSync(join(dir, 's-')) } }).at('/unused')
    await expect(m.ingest(read('web.mp4'), { name: 'web.mp4' })).rejects.toMatchObject({ code: 'M018', message: expect.stringContaining('mediaFfmpeg()') })
  })
})
