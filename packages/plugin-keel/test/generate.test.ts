// The generate host without workers (Node has none): each job runs here, is kept by its key, and its result packs
// into one buffer and back for Cache Storage.
import { describe, expect, it } from 'vitest'
import { forget, generate, keyOf } from '../src/generate'
import { pack, transferables, unpack } from '../src/generate/pack'
import { paintSurface, PAPER } from '../vendor/modules/surfaces.mjs'
import { digestOf, portraitSettings, sitterOf } from '../vendor/modules/portrait.mjs'

describe('pack', () => {
  it('keeps plain values and typed arrays, each on the one buffer', () => {
    const value = {
      name: 'x',
      n: [1, 2.5, null],
      parts: [{ position: new Float32Array([1, 2, 3]), index: new Uint32Array([7, 8]) }],
      data: new Uint8ClampedArray([1, 2, 3, 4, 5]),
    }
    const back = unpack<typeof value>(pack(value))
    expect(back.name).toBe('x')
    expect(back.n).toEqual([1, 2.5, null])
    expect([...back.parts[0]!.position]).toEqual([1, 2, 3])
    expect(back.parts[0]!.index).toBeInstanceOf(Uint32Array)
    expect([...back.data]).toEqual([1, 2, 3, 4, 5])
    expect(back.data.buffer).toBe(back.parts[0]!.position.buffer)
  })

  it('lists each buffer to transfer once', () => {
    const shared = new Float32Array(8)
    const value = { a: shared.subarray(0, 4), b: shared.subarray(4), c: [new Uint8Array(2)] }
    expect(transferables(value)).toHaveLength(2)
  })
})

describe('generate', () => {
  it('keys a job by its args in any order', () => {
    expect(keyOf('surface', { surface: 'paper', seed: 1 })).toBe(
      keyOf('surface', { seed: 1, surface: 'paper' }),
    )
    expect(keyOf('surface', { seed: 1 })).not.toBe(keyOf('bust', { seed: 1 }))
  })

  it('paints a surface as the module does, and keeps it', async () => {
    const request = { surface: 'paper', seed: 4, width: 32 } as const
    const first = generate('surface', request)
    expect(generate('surface', { ...request })).toBe(first)
    const painted = await first
    const direct = paintSurface(PAPER, { seed: 4, width: 32 })
    expect(painted.digest).toBe(direct.digest)
    expect(new Uint8Array(painted.buffers[0])).toEqual(new Uint8Array(direct.buffers[0]))
    forget('surface', request)
    expect(generate('surface', request)).not.toBe(first)
  })

  it('meshes a bust with its recipe digest', async () => {
    const { recipe } = sitterOf(
      portraitSettings({ seed: 3, face: 'A', detail: 'far', hand: 'point' }),
    )
    const bust = await generate('bust', recipe)
    expect(bust.digest).toBe(digestOf(recipe))
    expect(bust.parts.length).toBeGreaterThan(5)
    expect(bust.parts.every((p) => p.position.length === p.normal.length)).toBe(true)
  })

  it("meshes the same bust from the sitter's settings, with its palette", async () => {
    const settings = { seed: 3, face: 'A', detail: 'far', hand: 'point' } as const
    const { recipe, palette } = sitterOf(portraitSettings(settings))
    const bust = await generate('bust', settings)
    expect(bust.digest).toBe(digestOf(recipe))
    expect(bust.palette).toEqual(palette)
  })

  it('refuses a plate where there is no WebGL2, and forgets the failure', async () => {
    const job = { width: 8, height: 8 }
    await expect(generate('plate', job)).rejects.toThrow()
    await expect(generate('plate', job)).rejects.toThrow()
  })
})
