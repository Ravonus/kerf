// Inks come from warp's tokens, read through the cascade from the element itself, so a ramp follows theme, seed, and any
// `data-theme` island around it. Every tone ramp runs from the page outward: faint to strong in light and in dark alike.
/** A theme tone inks can be drawn from. */
export type Tone = 'accent' | 'neutral' | 'positive' | 'caution' | 'critical' | 'info' | 'highlight'
/** A tone, or your own inks: tokens (`--warp-color-x`), any CSS colour, or `none`, faintest first. */
export type Ramp = Tone | string[]

// Whole names, never built from parts: the build's CSS purge keeps a token only if it finds the word.
const TONES: Record<Tone, string[]> = {
  neutral: [
    '--warp-color-surface-hover',
    '--warp-color-border-strong',
    '--warp-color-text-subtle',
    '--warp-color-text',
  ],
  accent: [
    '--warp-color-accent-soft',
    '--warp-color-accent-border',
    '--warp-color-accent-text',
    '--warp-color-text',
  ],
  positive: [
    '--warp-color-positive-soft',
    '--warp-color-positive-border',
    '--warp-color-positive-text',
    '--warp-color-text',
  ],
  caution: [
    '--warp-color-caution-soft',
    '--warp-color-caution-border',
    '--warp-color-caution-text',
    '--warp-color-text',
  ],
  critical: [
    '--warp-color-critical-soft',
    '--warp-color-critical-border',
    '--warp-color-critical-text',
    '--warp-color-text',
  ],
  info: [
    '--warp-color-info-soft',
    '--warp-color-info-border',
    '--warp-color-info-text',
    '--warp-color-text',
  ],
  highlight: [
    '--warp-color-highlight-soft',
    '--warp-color-highlight-border',
    '--warp-color-highlight-text',
    '--warp-color-text',
  ],
}

/** The inks of a ramp, as CSS, for `inks` steps: a tone's quieter tiers stop before its strongest ink. */
export function rampInks(ramp: Ramp, inks = 4) {
  if (Array.isArray(ramp)) return ramp
  return ['none', ...TONES[ramp].slice(0, Math.max(1, Math.min(4, inks)))]
}

let scratch: CanvasRenderingContext2D | null | undefined

/** One computed colour as packed RGBA. Modern colours serialise as oklch() or color(), so a canvas does the conversion. */
export function pack(css: string) {
  const m = css.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\)$/)
  if (m)
    return (
      ((Math.round((m[4] === undefined ? 1 : +m[4]) * 255) << 24) |
        (+m[3]! << 16) |
        (+m[2]! << 8) |
        +m[1]!) >>>
      0
    )
  if (scratch === undefined) {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    scratch = c.getContext('2d', { willReadFrequently: true })
  }
  if (!scratch) return 0
  scratch.clearRect(0, 0, 1, 1)
  scratch.fillStyle = css
  scratch.fillRect(0, 0, 1, 1)
  const d = scratch.getImageData(0, 0, 1, 1).data
  return ((d[3]! << 24) | (d[2]! << 16) | (d[1]! << 8) | d[0]!) >>> 0
}

/** The ramp as packed RGBA, resolved where `el` sits. */
export function palette(el: Element, ramp: Ramp, inks?: number) {
  const list = rampInks(ramp, inks)
  const probe = el.ownerDocument.createElement('i')
  probe.hidden = true
  el.append(probe)
  const out = Uint32Array.from(list, (ink) => {
    if (ink === 'none') return 0
    probe.style.color = ink.startsWith('--') ? `var(${ink})` : ink
    return pack(getComputedStyle(probe).color)
  })
  probe.remove()
  return out
}

/** A dither tier's numbers: how many inks, how fast it moves, how far a touch reaches, and its gain. */
export interface Tier {
  inks: number
  speed: number
  reach: number
  gain: number
}

/** The tier's numbers, from Warp's own `--warp-x` where `el` sits; a `--warp-dither-*` set in CSS overrides one. */
export function tier(el: Element): Tier {
  const s = getComputedStyle(el),
    read = (name: string, fallback: number) => {
      const v = parseFloat(s.getPropertyValue(name))
      return Number.isNaN(v) ? fallback : v
    }
  const x = read('--warp-x', 0.5)
  return {
    inks: read('--warp-dither-inks', Math.max(3, 2 + 2 * x)),
    speed: read('--warp-dither-speed', x),
    reach: read('--warp-dither-reach', Math.min(1, x * 1.4)),
    gain: read('--warp-dither-gain', Math.max(0.75, 0.55 + x / 2)),
  }
}
