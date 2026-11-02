// OKLCH → sRGB with CSS Color 4 gamut mapping (chroma reduced until it fits), WCAG 2.x luminance and contrast.
// Plain Node, no dependencies: the token build and the contrast gate share it.

function oklchToLinear(L, C, H) {
  const h = (H * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const inGamut = rgb => rgb.every(c => c >= -1e-4 && c <= 1 + 1e-4)

/** `{ L, C, H }` → linear sRGB, with chroma reduced (never lightness or hue) until it is inside sRGB. */
export function toLinear({ L, C, H }) {
  const rgb = oklchToLinear(L, C, H)
  if (inGamut(rgb)) return rgb
  let lo = 0, hi = C
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklchToLinear(L, mid, H))) lo = mid
    else hi = mid
  }
  return oklchToLinear(L, lo, H).map(v => Math.min(1, Math.max(0, v)))
}

const encode = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
const decode = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

export const hex = lin => '#' + lin.map(v => Math.round(Math.min(1, Math.max(0, encode(v))) * 255).toString(16).padStart(2, '0')).join('')

/** The 8-bit sRGB the browser will actually paint, back in linear light (so checks match the shipped hex). */
export const quantize = lin => lin.map(v => decode(Math.round(Math.min(1, Math.max(0, encode(v))) * 255) / 255))

export const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
export const contrast = (a, b) => {
  const y1 = luminance(a), y2 = luminance(b)
  return (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05)
}

/** Linear sRGB `fg` at `alpha` over `bg`. */
export const over = (fg, bg, alpha) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha))

const toLab = ({ L, C, H }) => [L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180)]
const fromLab = ([L, a, b]) => ({ L, C: Math.hypot(a, b), H: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 })

/** color-mix(in oklab, a p, b): what the browser does, returned as OKLCH. */
export const mix = (a, b, p) => fromLab(toLab(a).map((v, i) => v * p + toLab(b)[i] * (1 - p)))

/** `#rrggbb` → `{ L, C, H }`, so a brand hex can seed the accent. */
export function fromHex(text) {
  const n = parseInt(text.replace('#', ''), 16)
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(decode)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return fromLab([
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ])
}
