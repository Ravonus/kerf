import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { createMediaEncode } from '../src/build.mjs'

const folders: string[] = [],
  hasFfmpeg = !spawnSync('ffmpeg', ['-version']).error
afterEach(() => folders.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

// Packet preservation needs an actual AAC encoder and MP4 muxer, rather than mocked provider output.
it.runIf(hasFfmpeg)(
  'native candidates retain encoded audio and the complete source frame timing',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-native-audio-'))
    folders.push(dir)
    const source = join(dir, 'source.mp4'),
      candidate = join(dir, 'candidate.mp4'),
      enc = createMediaEncode({ key: 'video/h264' })
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=64x48:r=8:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-threads',
      '2',
      source,
    ])
    if (!enc.native) throw new Error('Missing native video capability')
    writeFileSync(candidate, await enc.native.encode(source, { knob: 20 }))
    const before = await enc.native.fingerprint(source),
      after = await enc.native.fingerprint(candidate)
    expect(after.audio).toBe(before.audio)
    expect(after.audioStart).toBe(before.audioStart)
    expect(after.timeline).toEqual(before.timeline)
    expect(after.video).not.toBe(before.video)
    expect((await enc.info(candidate)).audio.codec).toBe('aac')
    expect(readFileSync(candidate).indexOf('moov')).toBeLessThan(
      readFileSync(candidate).indexOf('mdat'),
    )
  },
)

// The AVIF muxer requires an AV1 encoder; other installations still run the native audio regression above.
it.runIf(
  hasFfmpeg &&
    spawnSync('ffmpeg', ['-encoders'], { encoding: 'utf8' }).stdout.includes('libsvtav1'),
)(
  'reads the complete AVIF animation track rather than the primary still image',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-avif-track-'))
    folders.push(dir)
    const file = join(dir, 'animation.avif')
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=64x64:r=2:d=1',
      '-c:v',
      'libsvtav1',
      '-preset',
      '12',
      '-svtav1-params',
      'lp=2',
      '-pix_fmt',
      'yuv420p',
      file,
    ])
    const reader = await createMediaEncode({ key: 'video/h264' }).frames(file)
    expect(reader.timeline).toHaveLength(2)
    let count = 0
    for await (const frame of reader.read({ width: 64, height: 64 })) {
      expect(frame.rgba).toHaveLength(64 * 64 * 4)
      count++
    }
    expect(count).toBe(2)
  },
  30000,
)
