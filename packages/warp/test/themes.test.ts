// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { resolveThemes } from '../src/plugin/themes.mjs'

describe('theme resolution', () => {
  it('resolves forward colour aliases after each theme merge without mutating inputs', () => {
    const input = {
      colors: { brand: 'blue-ink', 'blue-ink': '#112233', family: { hue: 120, chroma: 0.1 } },
      system: { space: { group: 8, page: 20 } },
      parts: {
        button: { bg: 'brand', hover: { text: 'white' } },
        badge: { bg: { hue: 30, chroma: 0.1 } },
      },
      tokens: { '--warp-color-page': '#ffffff' },
      seed: { hue: 100, chroma: 0.1 },
      themes: {
        ocean: {
          colors: { 'blue-ink': '#445566' },
          system: { space: { group: 12 } },
          parts: { button: { hover: { bg: 'brand' } } },
          seed: { neutral: 'brand' },
        },
      },
    }
    const before = structuredClone(input)
    const result = resolveThemes(input)
    expect(result.default.parts.button.bg).toBe('#112233')
    expect(result.ocean.parts.button).toEqual({
      bg: '#445566',
      hover: { bg: '#445566', text: '#ffffff' },
    })
    expect(result.ocean.system.space).toEqual({ group: '12px', page: '20px' })
    expect(result.ocean.seed).toEqual({ accent: { hue: 100, chroma: 0.1 }, neutral: '#445566' })
    expect(result.ocean.tokens).toEqual(input.tokens)
    expect(result.default.parts.badge.bg).toEqual({ hue: 30, chroma: 0.1 })
    expect(result.default.colors.family).toEqual({ hue: 120, chroma: 0.1 })
    expect(input).toEqual(before)
  })
  it.each([
    [{ colors: { a: 'b', b: 'a' } }, 'colors.a', /a -> b -> a/],
    [{ colors: { a: 'missing' } }, 'colors.a', /missing/],
    [{ colors: { brand: { hue: Infinity, chroma: 0.1 } } }, 'colors.brand', /family/],
    [{ colors: { brand: '#abc' } }, 'colors.brand', /rrggbb/],
    [{ colors: { page: '#ffffff' } }, 'colors.page', /reserved/],
    [{ colors: { brand: '#ffffff' }, themes: { brand: {} } }, 'themes.brand', /collide/],
    [
      { themes: { ocean: { colors: { new: '#ffffff' } } } },
      'themes.ocean.colors.new',
      /cannot add/,
    ],
    [{ parts: { button: { bg: 'brnad' } } }, 'parts.button.bg', /unknown colour/],
    [{ system: { space: { group: -1 } } }, 'system.space.group', /nonnegative/],
    [{ themes: { ocean: { parts: null } } }, 'themes.ocean.parts', /null or an array/],
    [{ themes: { ocean: { dials: {} } } }, 'themes.ocean.dials', /unknown/],
  ])('rejects invalid input at %s', (input, path, message) => {
    try {
      resolveThemes(input)
      throw new Error('expected rejection')
    } catch (error) {
      expect(error).toMatchObject({ path, message: expect.stringMatching(message) })
    }
  })
})
