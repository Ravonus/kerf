// @vitest-environment node
// A solid Button's hover fill is its own colour, deeper: the same hue at a lower lightness, with its ink still at AA.
// It used to lean toward the highlight (a yellow-green), so a brown key (#743c16, vivid) turned olive under the hand.
// Every tone, in light and dark, over a few seeds (the brown, warp's default green, a blue, a violet). The soft,
// outline and ghost tints keep the tone's hue too, and the pull-out's hard offset carries the button's hue.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type * as Playwright from 'playwright-core'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const styles = fileURLToPath(new URL('../../warp-core/styles', import.meta.url))
const css = ['warp.css', 'components/base.css', 'components/button.css']
  .map((f) => readFileSync(join(styles, f), 'utf8'))
  .join('\n')

// seed hue and chroma: #743c16 is oklch(0.42 0.1 50)
const SEEDS = {
  brown: [50, 0.1],
  green: [152, 0.115],
  blue: [260, 0.14],
  violet: [300, 0.16],
} as const
const TONES = ['', 'accent', 'neutral', 'positive', 'caution', 'critical', 'info']
const EMPHASES = ['', 'soft', 'outline', 'ghost']

let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(() => browser?.close())
vi.setConfig({ testTimeout: 60_000 })

type Row = {
  name: string
  solid: number[]
  pa: number[]
  pb: number[]
  ink: number[]
  off: number[]
}

async function rows(theme: 'light' | 'dark', [h, c]: readonly [number, number]) {
  const page = await browser.newPage()
  const buttons = TONES.flatMap((tone) =>
    EMPHASES.map(
      (e) =>
        `<button data-scope="button"${tone ? ` data-tone="${tone}"` : ''}${e ? ` data-emphasis="${e}"` : ''} data-name="${tone || 'primary'} ${e || 'solid'}">Go<i data-k="solid" style="background-color:var(--_solid)"></i><i data-k="pa" style="background-color:var(--_pa)"></i><i data-k="pb" style="background-color:var(--_pb)"></i><i data-k="ink" style="background-color:var(--_ink-on)"></i><i data-k="off" style="background-color:var(--_off)"></i></button>`,
    ),
  ).join('')
  await page.setContent(
    `<!doctype html><html data-expression="vivid" data-theme="${theme}" style="color-scheme:${theme};--warp-seed-accent-h:${h};--warp-seed-accent-c:${c}"><style>${css}</style><body>${buttons}</body></html>`,
  )
  const out = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rgb = (color: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    return [...document.querySelectorAll<HTMLElement>('[data-scope="button"]')].map((b) => {
      const get = (k: string) =>
        rgb(getComputedStyle(b.querySelector(`[data-k="${k}"]`)!).backgroundColor)
      return {
        name: b.dataset.name!,
        solid: get('solid'),
        pa: get('pa'),
        pb: get('pb'),
        ink: get('ink'),
        off: get('off'),
      }
    })
  })
  await page.close()
  return out as Row[]
}

const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}
/** oklch [l, c, h] from sRGB bytes */
function oklch([r, g, b]: number[]) {
  const [R, G, B] = [lin(r!), lin(g!), lin(b!)]
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360]
}
const hueGap = (a: number[], b: number[]) => {
  const [, ca, ha] = oklch(a)
  const [, cb, hb] = oklch(b)
  if (ca < 0.03 || cb < 0.03) return 0 // a grey has no hue to keep
  const d = Math.abs(ha - hb) % 360
  return Math.min(d, 360 - d)
}

describe.each(['light', 'dark'] as const)('%s', (theme) => {
  test.each(Object.keys(SEEDS))(
    'seed %s: hover fills keep the hue, solids go deeper, ink stays at AA',
    async (seed) => {
      const bad: string[] = []
      for (const r of await rows(theme, SEEDS[seed as keyof typeof SEEDS])) {
        const solid = r.name.endsWith(' solid')
        for (const k of ['pa', 'pb'] as const) {
          // a tint is the tone mixed into the surface, which has its own faint hue: its deeper step must not move
          // from its first (the highlight mix did); a solid's fill must not move from the solid
          const gap = solid ? hueGap(r[k], r.solid) : hueGap(r[k], r.pa)
          if (gap > 6) bad.push(`${r.name} ${k}: hue moved ${gap.toFixed(1)}° from the tone`)
          if (solid) {
            if (oklch(r[k])[0]! >= oklch(r.solid)[0]!)
              bad.push(`${r.name} ${k}: not darker than the rest`)
            const ratio = contrast(r.ink, r[k])
            if (ratio < 4.5) bad.push(`${r.name} ${k}: ink ${ratio.toFixed(2)}:1`)
          }
        }
        if (solid && hueGap(r.off, r.solid) > 6)
          bad.push(`${r.name} offset: hue moved from the tone`)
      }
      expect(bad).toEqual([])
    },
  )
})
