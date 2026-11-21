// Nitro's `traceDeps` for an app: nothing the app doesn't have, which nf3 warns it can't resolve.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { traceDeps } from '../src/vite/trace-deps.mjs'

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
