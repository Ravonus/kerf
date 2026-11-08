// Enumerate the currently supported Button frame checks without inferring CSS cascade.
const bad = (path, message) => Object.assign(new Error(message), { path })

/** Return the checked host, frame text and sweep pairs for each canonical mode. */
export function buttonPairs(button, resolved, tokens = {}) {
  const override = (name, fallback) => {
    const local = `--warp-sweep-${name}`
    const configured = `--warp-config-part-sweep-${name}`
    const token = Object.hasOwn(tokens, local) ? local : Object.hasOwn(tokens, configured) ? configured : null
    if (token && !/^#[0-9a-f]{6}$/i.test(tokens[token])) {
      throw bad(`tokens.${token}`, 'only #rrggbb is supported for this Button check')
    }
    return token ? { token, value: tokens[token] } : fallback
  }
  const background = { token: '--warp-button-bg', value: button.bg }
  const text = { token: '--warp-button-text', value: button.text }
  const label = override('label', text)
  const content = override('text', text)
  return ['light', 'dark'].flatMap((theme) =>
    ['quiet', 'balanced', 'vivid'].flatMap((expression) => {
      const colors = resolved[`${theme}/${expression}`]
      const common = { palette: 'default', theme, expression, state: 'rest' }
      const pair = (part, emphasis, site, fg, bg, path) => ({
        ...common, part, emphasis, site, fg, bg, path,
      })
      const rows = [
        pair('button', 'solid', 'base', text, background, 'parts.button.text'),
        pair('sweep', 'frame', 'text-unfilled', label, background,
          label.token === text.token ? 'parts.button.text' : `tokens.${label.token}`),
        pair('sweep', 'frame', 'text-unfilled', content, background,
          content.token === text.token ? 'parts.button.text' : `tokens.${content.token}`),
        pair('sweep', 'frame', 'text-filled', content, background,
          content.token === text.token ? 'parts.button.text' : `tokens.${content.token}`),
      ]
      for (const tone of ['positive', 'caution', 'critical', 'info']) {
        const key = `${tone}-text`
        if (!colors?.[key]) throw bad('parts.button.bg', `cannot resolve sweep ${key}`)
        const stroke = override('stroke', { token: `--warp-color-${key}`, value: colors[key] })
        rows.push(pair('sweep', 'soft', 'stroke-surface', stroke, background,
          stroke.token.startsWith('--warp-color-') ? 'parts.button.bg' : `tokens.${stroke.token}`))
      }
      if (theme === 'light') {
        const rawTrack = tokens['--warp-frame-track']
        if (rawTrack !== undefined && !/^#[0-9a-f]{6}$/i.test(rawTrack)) {
          throw bad('tokens.--warp-frame-track', 'only #rrggbb is supported for this Button check')
        }
        const track = override('base', { token: '--warp-frame-track', value: rawTrack ?? colors.text })
        rows.push(pair('sweep', 'frame', 'base-surface', track, background,
          track.token === '--warp-frame-track' ? 'parts.button.bg' : `tokens.${track.token}`))
      }
      return rows
    }),
  )
}
