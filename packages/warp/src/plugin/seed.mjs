// A seed: the accent (and optionally neutral) hue and chroma the palette grows from, given as OKLCH or as #rrggbb.
import { fromHex } from '../../tokens/color.mjs'

/** weft's own accent, the green every untouched app starts from. */
export const DEFAULT = { hue: 152, chroma: 0.115 }

function hueOf(value, name) {
  if (typeof value === 'string') {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} must be #rrggbb`)
    const { C, H } = fromHex(value)
    return { hue: Math.round(H * 10) / 10, chroma: Math.round(C * 1000) / 1000 }
  }
  const { hue, chroma } = value ?? {}
  if (!(hue >= 0 && hue < 360) || !(chroma >= 0 && chroma <= 0.37))
    throw new Error(
      `${name === 'accent' ? 'seed' : name} is { hue: 0–360, chroma: 0–0.37 } or ${name === 'accent' ? '{ accent: "#rrggbb" }' : '"#rrggbb"'}`,
    ) // weft reports it as P115
  return { hue, chroma }
}

/** `seed` as `{ hue, chroma, neutral? }`; throws (P115) on a value out of range. */
export function normalizeSeed(seed) {
  const { accent, neutral, ...rest } = seed ?? {}
  const out = hueOf(
    accent ?? (Object.keys(rest).length || neutral === undefined ? rest : DEFAULT),
    'accent',
  )
  return neutral === undefined ? out : { ...out, neutral: hueOf(neutral, 'neutral') }
}
