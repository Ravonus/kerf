import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { createMediaEncode } from '../src/build.mjs'

// Packet identity and HLS timestamp read-back require the real installed muxer.
it.runIf(!spawnSync('ffmpeg', ['-version']).error)(
  'streams a complete movie as bounded files with identical video, audio and relative frame timing',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-stream-'))
    try {
      const source = join(dir, 'source.mp4'),
        directory = join(dir, 'stream')
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=64x48:r=8:d=4',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=4',
        '-c:v',
        'libx264',
        '-g',
        '8',
        '-c:a',
        'aac',
        '-threads',
        '2',
        '-avoid_negative_ts',
        'make_zero',
        source,
      ])
      const enc = createMediaEncode({ key: 'video/h264' })
      if (!enc.native) throw new Error('Missing native capability')
      const out = await enc.native.stream(source, { directory, seconds: 1 })
      expect(out.verification).toMatchObject({
        video: 'identical encoded samples',
        audio: 'identical encoded samples',
        timing: 'complete',
        frames: 32,
        segments: 4,
      })
      expect(
        out.files.every((file) => readFileSync(join(directory, file.name)).length === file.bytes),
      ).toBe(true)
      expect(readFileSync(join(directory, out.playlist), 'utf8')).toContain('#EXT-X-ENDLIST')
      await expect(enc.native.stream(source, { directory })).rejects.toThrow('must be empty')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)
