// Shared by the gen tests: a scratch project with a style and a recipe, a counting adapter and a stand-in distiller.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createMockAdapter,
  sha256,
  type GenAdapter,
  type GenRequest,
  type GenRunOptions,
} from '../src/gen/index.mjs'
import { png } from '../src/paint.mjs'

export const STYLE = {
  style: 'keel-style@1',
  seed: 7,
  manner: 'thin oil glazes, broken colour, soft lost edges',
  avoid: 'text, logo, watermark',
  light: 'soft warm key upper left, cool fill',
  palette: { sky: '#a9b2ab', leaf: '#5c6a52' },
}

const dirs: string[] = []

/** A fresh folder, removed by `cleanup()`. */
export function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'keel-gen-'))
  dirs.push(dir)
  return dir
}

export function cleanup() {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
}

/** A project folder with `look.style.json` and `plate.gen.json` holding `slots`. */
export function project(slots: Record<string, object>, style: object = STYLE) {
  const dir = scratch()
  writeFileSync(join(dir, 'look.style.json'), JSON.stringify(style))
  const recipeFile = join(dir, 'plate.gen.json')
  writeFileSync(
    recipeFile,
    JSON.stringify({ gen: 'keel-gen@1', style: './look.style.json', slots }),
  )
  return {
    dir,
    recipeFile,
    cacheDir: join(dir, '.weft', 'cache', 'gen'),
    lockFile: join(dir, 'gen.lock.json'),
  }
}

/** A small guide PNG: a gradient, `seed` shifting it. */
export function guidePng(width = 16, height = 12, seed = 0) {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++)
    rgba.set([(i * 7 + seed) & 255, (i * 3) & 255, (i + seed * 5) & 255, 255], i * 4)
  return new Uint8Array(png(rgba, width, height))
}

/** An adapter that records every request it runs. */
export function counted(adapter: GenAdapter = createMockAdapter()) {
  const calls: GenRequest[] = []
  const wrapped: GenAdapter = {
    ...adapter,
    run: (request, options) => {
      calls.push(request)
      return adapter.run(request, options)
    },
  }
  return { calls, adapter: wrapped }
}

/** A stand-in distiller: a few bytes naming the slot and the chosen candidate's digest. */
export const distil: GenRunOptions['distil'] = ({ slot, candidates, chosen }) => ({
  bytes: new TextEncoder().encode(`KMX2 ${slot.name} ${sha256(candidates[chosen]!.bytes)}`),
  kind: slot.out,
  dims: [8, 8],
  params: { tone: 0.5 },
})
