// What Nitro bundles and traces for a server: no `traceDeps` entry the app doesn't have, which nf3 warns it can't
// resolve, and Takumi's addon as an external that pnpm doesn't hoist, which a bundle couldn't resolve by name.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { Plugin } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { externalAddons, traceDeps } from '../src/vite/trace-deps.mjs'

const require = createRequire(import.meta.url)
/** Rolldown's entry, as far as this test calls it: it isn't one of this package's own dependencies. */
type Rolldown = (options: {
  input: string
  plugins: never
  onLog: (level: string, log: { code?: string; message: string }) => void
}) => Promise<{ generate: (o: object) => Promise<unknown>; close: () => Promise<void> }>
const made: string[] = []
const tmp = (prefix: string) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  made.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const write = (root: string, files: Record<string, string>) => {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
}
const pkg = (name: string, deps: Record<string, string> = {}) =>
  JSON.stringify({ name, version: '1.0.0', dependencies: deps })

describe('traceDeps', () => {
  it('lists no media packages when nothing provides the media slot', () => {
    const root = tmp('kerf-trace-')
    write(root, {
      'package.json': pkg('app'),
      '.kerf/slots/media.server.ts': 'export const provider = null\nexport const load = () => {}\n',
    })
    expect(traceDeps(root)).toEqual({})
  })

  it("lists only the media provider's packages that are installed", () => {
    const root = tmp('kerf-trace-')
    write(root, {
      'package.json': pkg('app', { '@x/media': '1.0.0' }),
      '.kerf/slots/media.server.ts':
        'export const provider = {"plugin":"@x/media","version":"1.0.0","interface":1} as const\n',
      'node_modules/@x/media/package.json': pkg('@x/media', { sharp: '1', svgo: '1' }),
      'node_modules/@x/media/node_modules/sharp/package.json': pkg('sharp'),
      'node_modules/@x/media/node_modules/svgo/package.json': pkg('svgo', { 'css-tree': '1' }),
      'node_modules/@x/media/node_modules/svgo/node_modules/css-tree/package.json': pkg('css-tree'),
    })
    // csso isn't installed anywhere, so it isn't asked for
    expect(traceDeps(root)).toEqual({
      traceDeps: ['css-tree*', 'sharp*'],
    })
  })
})

describe("Takumi's addon and Bun's modules", () => {
  // the share-card renderer's import, in an app where pnpm keeps the package beside @kerf-js/start (og/native.mjs),
  // and SQLite's under Bun (db/sqlite.ts), which Node can't resolve
  const bundle = async (plugins: Plugin[]) => {
    const root = tmp('kerf-addon-')
    write(root, {
      'entry.js':
        "export const card = () => import('@takumi-rs/core')\nexport const db = () => import('bun:sqlite')\n",
    })
    const logs: string[] = []
    // Rolldown as Nitro's prerender bundle runs it: no Vite resolver in front, which treats `bun:` ids itself
    const { rolldown } = (await import(
      pathToFileURL(createRequire(require.resolve('vite')).resolve('rolldown')).href
    )) as { rolldown: Rolldown }
    const bundled = await rolldown({
      input: join(root, 'entry.js'),
      plugins: plugins as never,
      onLog: (_level, log) => void logs.push(`${log.code}: ${log.message}`),
    })
    await bundled.generate({})
    await bundled.close()
    return logs.filter((l) => /@takumi-rs\/core|bun:sqlite/.test(l))
  }

  it('is unresolved in a bundle that has no copy of its own', async () => {
    expect(await bundle([])).toEqual([
      expect.stringMatching(/^UNRESOLVED_IMPORT.*@takumi-rs\/core/),
      expect.stringMatching(/^UNRESOLVED_IMPORT.*bun:sqlite/),
    ])
  })

  it("is an external of Nitro's prerender bundle, so the build doesn't call it unresolved", async () => {
    expect(await bundle([externalAddons() as Plugin])).toEqual([])
  })
})
