// Normalize the finite system keys whose canonical token names are explicit in the table.
const definitions = {
  space: { prefix: '--warp-space-', unit: 'px', custom: true },
  radius: { prefix: '--warp-radius-', unit: 'px', custom: true,
    aliases: { card: 'surface', pill: 'round' } },
  font: { prefix: '--warp-font-', unit: 'forbidden', custom: true,
    tokenAliases: { body: '--warp-font-sans' } },
  shadow: { prefix: '--warp-elevation-', unit: 'forbidden', custom: true,
    tokenAliases: { none: '--warp-elevation-0', sm: '--warp-elevation-1',
      md: '--warp-elevation-2', lg: '--warp-elevation-3' } },
  border: { prefix: '--warp-border-', unit: 'px' },
  padding: { prefix: '--warp-pad-', unit: 'px' },
  control: { prefix: '--warp-control-', unit: 'px' },
  field: { prefix: '--warp-field-', unit: 'px' },
  layout: { prefix: '--warp-layout-', unit: 'px' },
  focus: { prefix: '--warp-focus-', unit: 'px', tokenAliases: { color: '--warp-color-focus' } },
}

export function systemScales(rules, tokens) {
  const declared = new Set(tokens)
  return rules.map((rule) => {
    if (rule.path === 'color') {
      const entries = tokens.filter((token) => token.startsWith('--warp-color-')).map((token) => ({
        key: token.slice('--warp-color-'.length), token, unit: 'forbidden', status: 'declared-input',
      }))
      return { path: rule.path, domain: rule.domain, allowCustom: false,
        status: entries.length ? 'declared-inputs' : 'unresolved', entries }
    }
    if (rule.path === 'text') {
      const keys = rule.keys.split(';')[0].split(',').map((key) => key.trim())
      const entries = keys.map((key) => ({ key,
        tokens: tokens.filter((token) => token.startsWith(`--warp-text-${key}-`)),
        unit: 'role fields', status: 'partial' }))
      return { path: rule.path, domain: rule.domain, allowCustom: true, status: 'partial', entries }
    }
    const config = definitions[rule.path]
    const expectedAliases = {
      radius: ['card aliases surface', 'pill aliases round'],
      font: ['body aliases --warp-font-sans'],
      shadow: ['none/sm/md/lg alias --warp-elevation-0/1/2/3'],
    }
    for (const phrase of expectedAliases[rule.path] ?? []) {
      if (!rule.binding.includes(phrase)) throw new Error(`Changed system alias rule: ${rule.path}`)
    }
    if (!config) return { path: rule.path, domain: rule.domain, status: 'unresolved', entries: [] }
    const keys = rule.keys.split(';')[0].split(',').map((key) => key.trim())
    if (keys.some((key) => !/^[a-z][\w-]*$/.test(key))) throw new Error(`Invalid system keys: ${rule.path}`)
    const entries = keys.map((key) => {
      const aliasOf = config.aliases?.[key]
      const token = config.tokenAliases?.[key] ?? `${config.prefix}${aliasOf ?? key}`
      return { key, token, ...(aliasOf ? { aliasOf } : {}),
        unit: rule.path === 'focus' && key === 'color' ? 'forbidden' : config.unit,
        status: declared.has(token) ? 'declared-input' : 'unresolved' }
    })
    return { path: rule.path, domain: rule.domain, allowCustom: !!config.custom,
      status: entries.every((entry) => entry.status === 'declared-input') ? 'declared-inputs' : 'partial', entries }
  })
}
