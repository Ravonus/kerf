// mediaFfmpeg(): what it declares, its options, and that a pinned binary is checked before it runs.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createMediaEncode } from '../src/build.mjs'
import { KEYS, mediaFfmpeg } from '../src/index.mjs'

const encode = createMediaEncode as (options: {
  key: string
  binary?: string
  sha256?: string
}) => ReturnType<typeof createMediaEncode>

const ffmpeg = spawnSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).stdout.trim()

describe('mediaFfmpeg()', () => {
  it('provides every codec key and asks to spawn ffmpeg and nothing else', () => {
    const p = mediaFfmpeg()
    expect(p.provides).toEqual(KEYS.map((key) => ({ slot: 'media.encode', key })))
    expect(p.permissions.spawn).toEqual(['ffmpeg', 'ffprobe'])
    expect(p.permissions.native).toBeUndefined()
    expect(p.permissions.net).toBeUndefined()
  })

  it('states the licence and patent position where `kerf add` prints it', () => {
    const notes = mediaFfmpeg().contribute({
      command: 'check',
      mode: 'development',
      root: '',
    }).notes
    expect(notes!.join(' ')).toMatch(/GPL/)
    expect(notes!.join(' ')).toMatch(/patent/)
  })

  it('validates options', () => {
    expect(() => mediaFfmpeg({ sha256: 'a'.repeat(64) })).toThrow(/needs `binary`/)
    expect(() => mediaFfmpeg({ binary: '/x', sha256: 'nope' })).toThrow(/sha256/)
    expect(() => mediaFfmpeg({ codec: 'x' })).toThrow(/unknown/)
  })
})

// Needs a real `ffmpeg` on PATH: these run the binary, and its absence is covered by the option tests above.
describe.skipIf(!ffmpeg)('the binary', () => {
  it('refuses one that is not the pinned file', async () => {
    const enc = encode({ key: 'video/h264', binary: ffmpeg, sha256: '0'.repeat(64) })
    await expect(enc.versions()).rejects.toMatchObject({ code: 'M019' })
  })

  it('runs the pinned file', async () => {
    const sha256 = createHash('sha256').update(readFileSync(ffmpeg)).digest('hex')
    expect((await encode({ key: 'video/h264', binary: ffmpeg, sha256 }).versions()).encoder).toBe(
      'libx264',
    )
  })

  it('says what to do when ffmpeg is missing', async () => {
    await expect(
      encode({ key: 'audio/aac', binary: '/nowhere/ffmpeg' }).encoderName(),
    ).rejects.toMatchObject({ code: 'M019' })
  })
})
