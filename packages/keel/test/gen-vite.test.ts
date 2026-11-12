// `?gen` imports: a Vite build that reads the recipe and the lock, emits each basis and calls no model.
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { keelGen, runGen } from '../src/gen/index.mjs'
import { cleanup, counted, distil, project } from './gen.fixture.ts'

afterEach(cleanup)

const slots = {
  'plate.sky': { op: 'make', says: 'soft cloud', out: 'palette:6', size: '8x8' },
  'mat.knit': { op: 'make', says: 'rib knit', out: 'tile:64', size: '8x8' },
}

const site = (dir: string, query = '?gen') => {
  writeFileSync(
    join(dir, 'main.js'),
    `import plate from './plate.gen.json${query}'\nglobalThis.plate = plate\n`,
  )
  writeFileSync(join(dir, 'index.html'), '<script type="module" src="./main.js"></script>\n')
  return () =>
    build({
      root: dir,
      configFile: false,
      logLevel: 'silent',
      plugins: [keelGen()],
      build: { outDir: join(dir, 'dist'), emptyOutDir: true, assetsInlineLimit: 0 },
    })
}

describe('keelGen', () => {
  it('turns a `?gen` import into records whose bases Vite emits', async () => {
    const p = project(slots)
    await runGen({ ...p, adapter: counted().adapter, distil, maxCalls: 4, maxWallMs: 60_000 })
    const lock = JSON.parse(readFileSync(p.lockFile, 'utf8'))
    await site(p.dir)()
    const assets = readdirSync(join(p.dir, 'dist', 'assets'))
    const js = readFileSync(
      join(
        p.dir,
        'dist',
        'assets',
        assets.find((f) => f.endsWith('.js'))!,
      ),
      'utf8',
    )
    for (const name of Object.keys(slots)) {
      const { basis } = lock.slots[name]
      const stem = basis.file.slice('basis/'.length, -'.kmx'.length)
      const emitted = assets.find((f) => f.startsWith(stem) && f.endsWith('.kmx'))!
      expect(readFileSync(join(p.dir, 'dist', 'assets', emitted))).toEqual(
        readFileSync(join(p.dir, basis.file)),
      )
      expect(js).toContain(`/assets/${emitted}`)
      expect(js).toContain(basis.digest)
    }
    expect(js).toMatch(/kind:.tile:64./)
  })

  it('fails the build naming a slot with no basis, and what a run would make', async () => {
    const p = project(slots)
    await runGen({ ...p, adapter: counted().adapter, distil, maxCalls: 4, maxWallMs: 60_000 })
    const lock = JSON.parse(readFileSync(p.lockFile, 'utf8'))
    rmSync(join(p.dir, lock.slots['mat.knit'].basis.file))
    await expect(site(p.dir)()).rejects.toThrow(
      /no basis for mat\.knit\. `gen run` would make 1 call for them/,
    )
  })

  it('hands on a slot’s raw output for `&bake=`, and fails when the cache does not have it', async () => {
    const p = project(slots)
    const plugin = keelGen()
    ;(plugin.configResolved as (config: { root: string }) => void)({ root: p.dir })
    const resolveId = plugin.resolveId as (
      this: unknown,
      source: string,
      importer: string,
    ) => Promise<string>
    const load = plugin.load as (this: unknown, id: string) => string
    const self = { resolve: () => Promise.resolve({ id: p.recipeFile }), addWatchFile: () => {} }
    const id = await resolveId.call(
      self,
      './plate.gen.json?gen&bake=plate.sky',
      join(p.dir, 'main.js'),
    )
    expect(() => load.call(self, id)).toThrow(/no raw output for plate\.sky/)
    await runGen({ ...p, adapter: counted().adapter, distil, maxCalls: 4, maxWallMs: 60_000 })
    const lock = JSON.parse(readFileSync(p.lockFile, 'utf8'))
    expect(load.call(self, id)).toBe(
      `export { default } from ${JSON.stringify(`${join(p.cacheDir, 'raw', lock.slots['plate.sky'].request, '0.png')}?media`)}\n`,
    )
  })
})
