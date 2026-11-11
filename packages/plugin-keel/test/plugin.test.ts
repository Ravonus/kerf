// The plugin's contract, without a browser: test/e2e.mjs renders it.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { keel, MODULES } from '../src/index.mjs'

const pkg = resolve(fileURLToPath(new URL('..', import.meta.url)))

describe('keel()', () => {
  it('provides the keel-lit key of surface.renderer, loaded lazily', () => {
    const p = keel()
    expect(p.provides).toEqual([{ slot: 'surface.renderer', key: 'keel-lit' }])
    const [ref] = p.contribute({ command: 'check', mode: 'development', root: '' }).provides!
    expect(ref!.sides.client).toEqual({
      module: '@weft-js/plugin-keel/runtime',
      export: 'renderer',
    })
  })

  it('keeps its agent notes inside the 1 KB budget', () => {
    const { agents } = keel().contribute({ command: 'check', mode: 'development', root: '' })
    expect(new TextEncoder().encode(agents!.text).length).toBeLessThan(1024)
  })

  it('ships every module it names, with types', () => {
    for (const id of MODULES) {
      expect(existsSync(resolve(pkg, `vendor/modules/${id}.mjs`)), id).toBe(true)
      expect(readFileSync(resolve(pkg, `vendor/modules/${id}.d.mts`), 'utf8')).toContain(
        `./${id}/index.js`,
      )
    }
  })
})

describe('the band module', () => {
  it('scores a seed the same way every time, without any audio', async () => {
    const band = await import('../vendor/modules/band.mjs')
    const score = band.scoreOf({ seed: 'grove', style: 'dream' })
    expect(score).toEqual(band.scoreOf({ seed: 'grove', style: 'dream' }))
    expect(band.partsAt(score, 0)).toEqual([])
    expect(band.partsAt(score, 1)).toHaveLength(6)
    expect(band.eventsAt(score, 0).length).toBeGreaterThan(0)
  })
})

describe('the tracks and camera-rail modules', () => {
  it('ride a camera on keyed tracks', async () => {
    const { sampleTracks } = await import('../vendor/modules/tracks.mjs')
    const { createCameraRail } = await import('../vendor/modules/camera-rail.mjs')
    const tracks = [
      {
        target: 'camera',
        property: 'eye',
        keys: [
          [0, [0, 0, 10]],
          [2, [0, 0, 4]],
        ],
      },
      {
        target: 'camera',
        property: 'fov',
        keys: [
          [0, 30],
          [2, 50],
        ],
      },
    ] as const
    const rail = createCameraRail(sampleTracks, { tracks })
    expect(rail.at(0).eye).toEqual([0, 0, 10])
    expect(rail.at(1).fov).toBeCloseTo(40)
    expect(rail.at(3)).toMatchObject({ eye: [0, 0, 4], fov: 50, roll: 0 })
  })
})
