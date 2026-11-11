// The build step for `?paint`: the PNG it writes, its cache by digest, and a Vite build that turns a recipe file into a
// media record.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { build } from 'vite'
import weft from '@weft-js/core/vite'
import { afterEach, describe, expect, it } from 'vitest'
import { keelPaint, paintFile, png } from '../src/paint.mjs'

const dirs: string[] = []
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'keel-paint-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const recipe = (dir: string, body: object, name = 'ground.paint.json') => {
  const file = join(dir, name)
  writeFileSync(file, JSON.stringify(body))
  return file
}

describe('png', () => {
  it('writes RGBA rows a decoder reads back', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 128])
    const bytes = png(rgba, 2, 2)
    expect([...bytes.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG')
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([2, 2])
    const data = bytes.subarray(41, 41 + bytes.readUInt32BE(33))
    const rows = inflateSync(data)
    expect([...rows.subarray(1, 9)]).toEqual([...rgba.subarray(0, 8)])
    expect([...rows.subarray(10, 18)]).toEqual([...rgba.subarray(8, 16)])
  })
})

describe('paintFile', () => {
  it('paints a recipe once, keyed by its digest, and again only when the recipe changes', async () => {
    const dir = scratch()
    const cache = join(dir, 'cache')
    const file = recipe(dir, { surface: 'paper', seed: 1, width: 24 })
    const first = await paintFile(file, cache)
    expect(first.painted).toBe(true)
    expect(first.file).toMatch(/[0-9a-f]{16}\/ground\.png$/)
    const again = await paintFile(file, cache)
    expect(again).toEqual({ file: first.file, painted: false })
    recipe(dir, { surface: 'paper', seed: 2, width: 24 })
    const changed = await paintFile(file, cache)
    expect(changed.painted).toBe(true)
    expect(changed.file).not.toBe(first.file)
    expect(readdirSync(cache).sort((a, b) => a.localeCompare(b))).toEqual(
      [first.file, changed.file]
        .map((f) => basename(dirname(f)))
        .sort((a, b) => a.localeCompare(b)),
    )
  })

  it('lays `with` over a preset, and refuses a surface it does not have', async () => {
    const dir = scratch()
    const cache = join(dir, 'cache')
    const plain = await paintFile(
      recipe(dir, { surface: 'paper', width: 16 }, 'a.paint.json'),
      cache,
    )
    const toned = await paintFile(
      recipe(dir, { surface: 'paper', width: 16, with: { tone: '#202830' } }, 'b.paint.json'),
      cache,
    )
    expect(readFileSync(plain.file)).not.toEqual(readFileSync(toned.file))
    await expect(
      paintFile(recipe(dir, { surface: 'velvet' }, 'c.paint.json'), cache),
    ).rejects.toThrow(/no surface `velvet`/)
  })
})

describe('keelPaint', () => {
  it('turns a `?paint` import into a media record of the painted image', async () => {
    const dir = scratch()
    recipe(dir, { surface: 'knit', seed: 3, width: 40, height: 20 })
    writeFileSync(
      join(dir, 'main.js'),
      "import ground from './ground.paint.json?paint'\nglobalThis.ground = ground\n",
    )
    writeFileSync(join(dir, 'index.html'), '<script type="module" src="./main.js"></script>\n')
    const out = join(dir, 'dist')
    const run = () =>
      build({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: [keelPaint(), weft()],
        build: { outDir: out, emptyOutDir: true },
      })
    await run()
    const js = readdirSync(join(out, 'assets')).find((f) => f.endsWith('.js'))!
    const code = readFileSync(join(out, 'assets', js), 'utf8')
    expect(code).toMatch(/width:40,height:20/)
    const image = readdirSync(join(out, 'assets')).find((f) => f.endsWith('.png'))!
    expect(image).toMatch(/^ground-/)
    const [key] = readdirSync(join(dir, '.weft', 'cache', 'paint'))
    const painted = join(dir, '.weft', 'cache', 'paint', key!, 'ground.png')
    const stamp = statSync(painted).mtimeMs
    await run()
    expect(statSync(painted).mtimeMs).toBe(stamp)
  })
})
