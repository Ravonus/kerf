// Enumerate Button and sweep paints without inferring the DOM cascade.
const bad = (path, message) => Object.assign(new Error(message), { path })
const surfaces = [
  'page',
  'surface',
  'surface-raised',
  'surface-overlay',
  'surface-sunken',
  'surface-hover',
]

/** Return checked host, frame text and sweep boundaries for each canonical mode. */
export function buttonPairs(button, resolved, tokens = {}) {
  const override = (name, fallback) => {
    const local = `--warp-sweep-${name}`
    const configured = `--warp-config-part-sweep-${name}`
    const token = Object.hasOwn(tokens, local)
      ? local
      : Object.hasOwn(tokens, configured)
        ? configured
        : null
    if (token && !/^#[0-9a-f]{6}$/i.test(tokens[token])) {
      throw bad(`tokens.${token}`, 'only #rrggbb is supported for this Button check')
    }
    return token ? { token, value: tokens[token] } : fallback
  }
  const background = { token: '--warp-button-bg', value: button.bg }
  const text = { token: '--warp-button-text', value: button.text }
  const base = override('base', background)
  const stroke = override('stroke', text)
  const label = override('label', text)
  const content = override('text', text)
  const path = (value, fallback) =>
    value === fallback
      ? `parts.button.${fallback === text ? 'text' : 'bg'}`
      : `tokens.${value.token}`
  return ['light', 'dark'].flatMap((theme) =>
    ['quiet', 'balanced', 'vivid'].flatMap((expression) => {
      const colors = resolved[`${theme}/${expression}`]
      const common = { palette: 'default', theme, expression, state: 'rest' }
      const pair = (part, emphasis, site, fg, bg, at) => ({
        ...common,
        part,
        emphasis,
        site,
        fg,
        bg,
        path: at,
      })
      const rows = [
        pair('button', 'solid', 'base', text, background, 'parts.button.text'),
        pair('sweep', 'frame', 'text-unfilled', label, background, path(label, text)),
        pair('sweep', 'frame', 'text-unfilled', content, background, path(content, text)),
        pair('sweep', 'frame', 'text-filled', content, background, path(content, text)),
        pair('sweep', 'frame', 'stroke-base', stroke, base, path(stroke, text)),
      ]
      for (const name of surfaces) {
        if (!colors?.[name]) throw bad('parts.button.bg', `cannot resolve ${name}`)
        const surface = { token: `--warp-color-${name}`, value: colors[name] }
        rows.push(pair('sweep', 'frame', 'base-surface', base, surface, path(base, background)))
        rows.push(pair('sweep', 'frame', 'stroke-surface', stroke, surface, path(stroke, text)))
      }
      return rows
    }),
  )
}
