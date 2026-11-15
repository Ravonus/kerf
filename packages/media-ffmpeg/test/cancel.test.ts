import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// A raw frame larger than the pipe buffer reproduces a decoder blocked while the consumer stops.
it.runIf(!spawnSync('ffmpeg', ['-version']).error)(
  'closes a backpressured real decoder promptly when a gallery sample is rejected',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-cancel-'))
    try {
      const file = join(dir, 'source.mp4')
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=768x768:r=30:d=4',
        '-c:v',
        'libx264',
        '-threads',
        '2',
        file,
      ])
      const module = new URL('../src/build.mjs', import.meta.url).href
      const code = `import {createMediaEncode} from ${JSON.stringify(module)};
        const reader=await createMediaEncode({key:'video/h264'}).frames(process.argv[1]);
        for await(const frame of reader.read({width:768,height:768})) {if(frame.rgba.length) break;}
        console.log('closed');`
      const result = execFileSync(process.execPath, ['--input-type=module', '-e', code, file], {
        timeout: 5000,
        encoding: 'utf8',
      })
      expect(result.trim()).toBe('closed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
  10000,
)
