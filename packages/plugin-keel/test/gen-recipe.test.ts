// The gen recipe: its checker, slot resolution, the prompt builder and the request digest.
import { describe, expect, it } from 'vitest'
import {
  buildPrompt,
  checkRecipe,
  checkStyle,
  parseOut,
  requestDigest,
  resolveSlots,
  type GenRecipe,
  type GenRequest,
  type GenStyle,
} from '../src/gen/index.mjs'
import { STYLE } from './gen.fixture.ts'

const style = STYLE as GenStyle
const recipe = (slots: Record<string, object>) =>
  ({ gen: 'keel-gen@1', style: './look.style.json', slots }) as GenRecipe

describe('checkRecipe', () => {
  it('reports every problem at once, each with its path', () => {
    const long = Array.from({ length: 26 }, (_, i) => `w${i}`).join(' ')
    const result = checkRecipe(
      recipe({
        'plate.sky': { op: 'paint', on: 'id:sky', says: 'cloud band', out: 'palette:6' },
        'plate.far': { op: 'over', on: 'id:far', says: 'two ranges', out: 'palette:6 texture:9' },
        'plate.mid': { op: 'over', on: 'id:mid', says: long, out: 'palette:6' },
        'plate.near': {
          op: 'over',
          on: 'id:near',
          says: 'an Acme sign by the lake',
          out: 'params',
        },
        'mat.leaf': { op: 'make', says: 'leaves made in ComfyUI', out: 'tile:64' },
        'fig.hand': { from: 'fig.arm', says: 'raised index' },
        'loop.a': { from: 'loop.b', op: 'make', says: 'a', out: 'params' },
        'loop.b': { from: 'loop.a' },
      }),
      { style, deny: ['acme'] },
    )
    expect(result.ok).toBe(false)
    const paths = result.problems.map((p) => p.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        'slots["plate.sky"].op',
        'slots["plate.far"].out',
        'slots["plate.mid"].says',
        'slots["plate.near"].says',
        'slots["mat.leaf"].says',
        'slots["fig.hand"].from',
        'slots["loop.a"].from',
      ]),
    )
    const message = (path: string) => result.problems.find((p) => p.path === path)?.message
    expect(message('slots["plate.far"].out')).toMatch(/`texture:9` is not a basis kind/)
    expect(message('slots["plate.mid"].says')).toMatch(/25 words/)
    expect(message('slots["plate.near"].says')).toMatch(/denied term `acme`/)
    expect(message('slots["mat.leaf"].says')).toMatch(/denied term `comfyui`/)
    expect(message('slots["fig.hand"].from')).toMatch(/no slot or library slot `fig.arm`/)
    expect(message('slots["loop.a"].from')).toMatch(/a cycle: loop.a → loop.b → loop.a/)
  })

  it('checks the style with it: a denied term in its text and a bad colour', () => {
    const result = checkRecipe(recipe({ a: { op: 'make', says: 'a stone', out: 'params' } }), {
      style: { ...STYLE, manner: 'acme house style', palette: { sky: 'blue' } },
      deny: ['ACME'],
    })
    expect(result.problems).toEqual([
      { path: 'style.palette["sky"]', message: 'a `#rrggbb` colour' },
      { path: 'style.manner', message: 'denied term `ACME`' },
    ])
  })

  it('takes a whole word only', () => {
    const ok = checkRecipe(
      recipe({ a: { op: 'make', says: 'acmes and acmeish', out: 'params' } }),
      {
        style,
        deny: ['acme'],
      },
    )
    expect(ok.problems).toEqual([])
  })
})

describe('checkRecipe on inheriting', () => {
  it('reports a field a slot lacks after inheriting, and an `on` an over needs', () => {
    const result = checkRecipe(recipe({ a: { op: 'over', says: 'x' } }), { style })
    expect(result.problems).toEqual([
      { path: 'slots["a"].out', message: 'missing' },
      { path: 'slots["a"].on', message: 'missing: `over` works on a guide' },
    ])
  })

  it('takes `file#slot` only with a resolver', () => {
    const r = recipe({ a: { from: 'other#sky', says: 'x' } })
    expect(checkRecipe(r, { style }).problems).toEqual([
      { path: 'slots["a"].from', message: 'another recipe is not given here' },
    ])
    const sky = { op: 'make', says: 'sky', out: 'palette:4' } as const
    expect(
      checkRecipe(r, { style, resolveFrom: (ref) => (ref === 'other#sky' ? sky : undefined) }).ok,
    ).toBe(true)
  })
})

describe('checkStyle', () => {
  it('reports a bad style on its own', () => {
    expect(checkStyle({ style: 'keel-style@2', seed: 1.5 }).problems.map((p) => p.path)).toEqual([
      'style',
      'seed',
      'manner',
      'avoid',
      'light',
      'palette',
    ])
    expect(checkStyle(STYLE).ok).toBe(true)
  })
})

describe('resolveSlots', () => {
  it('inherits from a slot or the library, defaults the rest, parents first', () => {
    const slots = resolveSlots(
      recipe({
        'plate.far': { from: 'plate.sky', on: 'id:far depth', says: 'two hazy ranges' },
        'plate.sky': {
          op: 'over',
          on: 'id:sky block',
          says: 'soft cloud',
          out: 'palette:6 residual:48x30',
          n: 2,
        },
        'mat.knit': { from: 'knit', seed: 3 },
      }),
      {
        ...style,
        via: 'mock',
        lib: { knit: { op: 'make', says: 'rib knit', out: 'tile:128+pbr' } },
      },
    )
    expect(slots.map((s) => s.name)).toEqual(['plate.sky', 'plate.far', 'mat.knit'])
    expect(slots[1]).toEqual({
      name: 'plate.far',
      op: 'over',
      on: 'id:far depth',
      says: 'two hazy ranges',
      out: 'palette:6 residual:48x30',
      n: 2,
      calls: 1,
      seed: 7,
      via: 'mock',
    })
    expect(slots[2]).toMatchObject({ op: 'make', says: 'rib knit', seed: 3, n: 1, on: '' })
  })

  it('throws with every problem', () => {
    expect(() => resolveSlots(recipe({ a: { op: 'x' } }), style)).toThrow(
      /slots\["a"\]\.op[\s\S]*slots\["a"\]\.says/,
    )
  })
})

describe('parseOut', () => {
  it('reads each basis kind', () => {
    expect(
      parseOut('params palette:6 field:24x15x2 tile:128+pbr stamps:16@32 flip:8@64 bogus'),
    ).toEqual([
      { kind: 'params', args: [] },
      { kind: 'palette', args: [6] },
      { kind: 'field', args: [24, 15, 2] },
      { kind: 'tile', args: [128], pbr: true },
      { kind: 'stamps', args: [16, 32] },
      { kind: 'flip', args: [8, 64] },
      undefined,
    ])
  })
})

describe('buildPrompt', () => {
  it('repaints a guide for `over`, keeping its layout, in the style', () => {
    const [slot] = resolveSlots(
      recipe({
        a: {
          op: 'over',
          on: 'id:sky id:far depth',
          says: 'overcast, soft cloud band.',
          out: 'palette:6',
        },
      }),
      style,
    )
    const { prompt, negative } = buildPrompt(style, slot!)
    expect(prompt).toBe(
      [
        'Repaint the attached guide in the manner below. Keep its composition, horizon, silhouettes and layout exactly; change only the handling and colour in the sky, far regions.',
        'Subject: overcast, soft cloud band.',
        'Manner: thin oil glazes, broken colour, soft lost edges.',
        'Light: soft warm key upper left, cool fill.',
        'Palette: #a9b2ab, #5c6a52.',
      ].join('\n'),
    )
    expect(negative).toBe('text, logo, watermark')
    expect(buildPrompt(style, slot!)).toEqual({ prompt, negative })
  })

  it('asks for a tileable texture when `make` gives a tile', () => {
    const slots = resolveSlots(
      recipe({
        tile: { op: 'make', says: 'rib knit', out: 'palette:4 tile:128+pbr' },
        sheet: { op: 'make', says: 'brush marks', out: 'stamps:16@32' },
      }),
      style,
    )
    expect(buildPrompt(style, slots[0]!).prompt).toMatch(
      /^Paint the subject below as a seamless, tileable texture/,
    )
    expect(buildPrompt(style, slots[1]!).prompt).toMatch(
      /^Paint the subject below on a plain, even ground/,
    )
  })
})

describe('requestDigest', () => {
  const base: GenRequest = {
    adapter: 'mock',
    model: 'mock@1',
    op: 'over',
    prompt: 'p',
    n: 1,
    inputs: [{ role: 'image', digest: 'recipe-digest', bytes: new Uint8Array([1, 2, 3]) }],
  }

  it('keys on an input by its digest, not its bytes, and not on key order', () => {
    const other = {
      ...base,
      inputs: [{ role: 'image', digest: 'recipe-digest', bytes: new Uint8Array([9]) }],
    }
    expect(requestDigest(other)).toBe(requestDigest(base))
    const reordered = {
      inputs: base.inputs,
      n: 1,
      prompt: 'p',
      op: 'over',
      model: 'mock@1',
      adapter: 'mock',
    }
    expect(requestDigest(reordered)).toBe(requestDigest(base))
    expect(requestDigest({ ...base, prompt: 'q' })).not.toBe(requestDigest(base))
    expect(requestDigest(base)).toMatch(/^[0-9a-f]{64}$/)
  })
})
