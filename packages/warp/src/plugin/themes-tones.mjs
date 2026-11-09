// Derive named tone channels from the same accent formulas as warp-core.
import { fromHex } from '../../tokens/color.mjs'

const roles = {
  solid: 'solid',
  'solid-hover': 'solid-hover',
  'ink-on': 'on-solid',
  soft: 'soft',
  text: 'text',
  border: 'border',
}
const parts = ['button', 'badge', 'status-dot', 'pill', 'link', 'nav']

/** Convert named hex colours to checked seed families for each palette. */
export function toneFamilies(palettes, validate) {
  const cache = new Map()
  return Object.fromEntries(
    Object.entries(palettes).map(([palette, colors]) => [
      palette,
      Object.fromEntries(
        Object.entries(colors).map(([name, value]) => {
          if (!cache.has(value)) {
            const { H, C } = fromHex(value)
            const seed = { hue: Math.round(H * 10) / 10, chroma: Math.round(C * 1000) / 1000 }
            cache.set(value, { ...seed, ...validate(seed) })
          }
          return [name, cache.get(value)]
        }),
      ),
    ]),
  )
}

/** Emit palette-scoped seed inputs and local component tone channels. */
export function toneCss(families, selected, source) {
  const names = Object.keys(families.default)
  const inputs = (palette) =>
    names
      .flatMap((name) => {
        const value = families[palette][name]
        return [
          `--_warp-named-tone-${name}-h:${value.hue}`,
          `--_warp-named-tone-${name}-c:${value.chroma}`,
          `--_warp-named-tone-${name}-text-l:${value.textLightness}`,
          `--_warp-named-tone-${name}-sweep-l:${value.sweepLightness}`,
        ]
      })
      .join(';')
  const paletteFallback = `[data-palette]{${inputs('default')}}`
  const boundaries = Object.keys(families)
    .map((name) => `[data-palette="${name}"]{${inputs(name)}}`)
    .join('')
  const variables = `@layer warp.tokens{:root{${inputs(selected)}}${paletteFallback}${boundaries}}\n`
  const formulas = Object.fromEntries(
    Object.entries(roles).map(([key, sourceName]) => {
      const found = source.match(new RegExp(`--warp-color-accent-${sourceName}:\\s*([^;]+);`))
      if (!found) throw new Error(`Missing canonical accent ${sourceName} token`)
      let value = found[1]
        .replaceAll('var(--_ah)', 'var(--_warp-tone-h)')
        .replaceAll('var(--_ac)', 'var(--_warp-tone-c)')
      if (key === 'text') {
        const prior = value
        value = value.replace('oklch(0.8 ', 'oklch(var(--_warp-tone-text-l) ')
        if (value === prior) throw new Error('Missing canonical dark accent text lightness')
      }
      return [key, value]
    }),
  )
  const sweep = source.match(/--warp-color-sweep:\s*([^;]+);/)
  if (!sweep) throw new Error('Missing canonical sweep token')
  const sweepFormula = sweep[1]
    .replaceAll('var(--_ah)', 'var(--_warp-tone-h)')
    .replaceAll('var(--_ac)', 'var(--_warp-tone-c)')
    .replace('oklch(0.515 ', 'oklch(var(--_warp-tone-sweep-l) ')
  if (!sweepFormula.includes('var(--_warp-tone-sweep-l)'))
    throw new Error('Missing canonical light sweep lightness')
  const rules = names
    .map((name) => {
      const hosts = parts.map((part) => `[data-scope="${part}"][data-tone="${name}"]`).join(',')
      const prefix = `[data-tone="${name}"]`
      const vars = [
        `--_warp-tone-h:var(--_warp-named-tone-${name}-h)`,
        `--_warp-tone-c:calc(var(--_warp-named-tone-${name}-c) * var(--warp-ref-accent-k))`,
        `--_warp-tone-text-l:var(--_warp-named-tone-${name}-text-l)`,
        `--_warp-tone-sweep-l:var(--_warp-named-tone-${name}-sweep-l)`,
        `--_warp-tone-sweep:${sweepFormula}`,
        ...Object.entries(formulas).map(([key, value]) => `--_${key}:${value}`),
      ].join(';')
      return (
        `${hosts}{${vars}}` +
        `[data-scope="button"]${prefix},[data-scope="pill"]${prefix}{--warp-color-sweep:var(--_warp-tone-sweep)}` +
        `[data-scope="button"]${prefix}[data-emphasis="frame"]>[data-part="sweep-outline"]>i{background:var(--_warp-tone-sweep)}` +
        `[data-scope="button"]${prefix}[data-emphasis="frame"]>[data-part="sweep-corners"]{color:var(--_warp-tone-sweep)}` +
        `[data-scope="link"]${prefix}{color:var(--_text)}` +
        `[data-scope="pill"]${prefix}{color:var(--_text)}` +
        `[data-scope="pill"]${prefix}:is([aria-current],[aria-selected="true"],[aria-pressed="true"]){background:var(--_soft);color:var(--_text);border-color:var(--_border)}` +
        `[data-scope="nav"]${prefix}{--_warp-nav-tone-text:var(--_text);--_warp-nav-tone-solid:var(--_solid)}` +
        `[data-scope="nav"]${prefix} a:is(:hover,:focus-visible,[aria-current]){color:var(--_warp-nav-tone-text)}` +
        `[data-scope="nav"]${prefix}>[data-part="indicator"],[data-scope="nav"]${prefix}:not([data-ready]) a[aria-current]::after{background:var(--_warp-nav-tone-solid)}`
      )
    })
    .join('')
  const known = ['accent', 'neutral', 'positive', 'caution', 'critical', 'info', ...names]
  const missing = `[data-scope="button"][data-tone]${known.map((name) => `:not([data-tone="${name}"])`).join('')}`
  const fallback =
    `${missing}{--warp-color-sweep:inherit;--_tone:inherit}` +
    `${missing}:is(:not([data-emphasis]),[data-emphasis="ghost"]){--warp-color-sweep:var(--_off)}` +
    `${missing}:not([data-emphasis]){--_solid:var(--warp-color-primary-solid);--_solid-hover:var(--warp-color-primary-solid-hover);--_ink-on:var(--warp-color-primary-on-solid)}`
  return variables + `@layer warp.components{${rules}${fallback}}\n`
}

/** Generate named tone inputs and rules after contrast checks. */
export function namedToneCss(
  options,
  { overrides, fitSeed, checkButtonCandidate, contrast, source },
) {
  if (!options.namedColors) return ''
  const palettes = options.palettes?.palettes ?? { default: options.namedColors }
  const selected = options.palettes?.selected ?? 'default'
  const tokens = Object.fromEntries(
    Object.entries(options.tokens ?? {}).filter(
      ([name]) => !/^--warp-(?:color-accent-|seed-accent-|color-sweep$)/.test(name),
    ),
  )
  const ambient = overrides({ ...options, tokens })
  const families = toneFamilies(palettes, (seed) => {
    const fittedDeclarations = fitSeed(seed, ambient)
    if (options.buttonCandidate)
      checkButtonCandidate(
        options.buttonCandidate,
        contrast(seed, fittedDeclarations).resolved,
        options.tokens,
      )
    const match = fittedDeclarations.match(
      /--warp-color-accent-text:light-dark\([\s\S]*?oklch\(([\d.]+) var\(--_ac\)/,
    )
    if (fittedDeclarations.includes('--warp-color-accent-text:') && !match)
      throw new Error('Cannot extract fitted accent text lightness')
    const sweepMatch = fittedDeclarations.match(/--warp-color-sweep:light-dark\(\s*oklch\(([\d.]+)/)
    if (fittedDeclarations.includes('--warp-color-sweep:') && !sweepMatch)
      throw new Error('Cannot extract fitted sweep lightness')
    return {
      textLightness: match ? Number(match[1]) : 0.8,
      sweepLightness: sweepMatch ? Number(sweepMatch[1]) : 0.515,
    }
  })
  return toneCss(families, selected, source())
}
