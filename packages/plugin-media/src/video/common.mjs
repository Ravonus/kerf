import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

export const short = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 8)
export const need = (o, key) => ({
  code: 'P101',
  severity: 'error',
  message: `${o} needs \`media.encode\` for ${key}, and nothing provides it. Add \`mediaFfmpeg()\` from @weft-js/plugin-media-ffmpeg to \`plugins\` in weft.config.ts.`,
})
export const errored = (name, e) => ({
  asset: null,
  files: [],
  diagnostics: [{ code: e.code ?? 'M019', severity: 'error', message: `${name}: ${e.message}` }],
})

/** A temp file for ffmpeg to read: `work(path)` runs with the bytes on disk. */
export async function onDisk(name, bytes, work) {
  const dir = mkdtempSync(join(tmpdir(), 'weft-media-'))
  try {
    const path = join(dir, `in${extname(name).toLowerCase()}`)
    writeFileSync(path, bytes)
    return await work(path, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
