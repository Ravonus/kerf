// Render finite part and system shapes from the normalized registry rows.
const identifier = (key) => (/^[a-zA-Z_$][\w$]*$/.test(key) ? key : JSON.stringify(key))
const scalar = (domain) => {
  if (domain === 'boolean') return 'boolean'
  if (['weight', 'leading', 'scalar', 'integer'].includes(domain)) return 'number | string'
  if (
    [
      'width',
      'radius',
      'space',
      'margin',
      'length',
      'position',
      'font-size',
      'tracking',
      'time',
      'angle',
    ].includes(domain)
  )
    return 'number | string'
  if (['underline-role', 'ring-role'].includes(domain))
    return 'string | { color?: string; width?: number | string; offset?: number | string }'
  if (domain === 'border')
    return 'string | { color?: string; width?: number | string; style?: string }'
  if (
    [
      'color',
      'family',
      'shadow',
      'font-shorthand',
      'transform-case',
      'easing',
      'gradient',
      'color or colour-list',
      'matching CSS grammar',
      'length-list',
    ].includes(domain)
  )
    return 'string'
  throw new Error(`Unknown theme domain: ${domain}`)
}

function fields(rows, indent) {
  const prefix = ' '.repeat(indent)
  const top = [...new Set(rows.map((row) => row.path.split('.')[0]))]
  return top
    .map((name) => {
      const direct = rows.find((row) => row.path === name)
      if (direct) return `${prefix}${identifier(name)}?: ${scalar(direct.domain)}`
      const nested = rows
        .filter((row) => row.path.startsWith(`${name}.`))
        .map((row) => ({ ...row, path: row.path.slice(name.length + 1) }))
      return `${prefix}${identifier(name)}?: ${name === 'font' ? 'string | ' : ''}{\n${fields(nested, indent + 2)}\n${prefix}}`
    })
    .join('\n')
}

export function partTypes(records) {
  const parts = [...new Set(records.map((row) => row.part))]
  return parts
    .map((part) => {
      const rows = records.filter((row) => row.part === part)
      const states = [
        ...new Set(rows.filter((row) => row.state !== 'rest').map((row) => row.state)),
      ]
      const rest = fields(
        rows.filter((row) => row.state === 'rest'),
        4,
      )
      const stateTypes = states
        .map(
          (state) =>
            `    ${identifier(state)}?: {\n${fields(
              rows.filter((row) => row.state === state),
              6,
            )}\n    }`,
        )
        .join('\n')
      return `  ${identifier(part)}?: {\n${[rest, stateTypes].filter(Boolean).join('\n')}\n  }`
    })
    .join('\n')
}

export function systemTypes(rules, textRoles, tokens) {
  const rule = (name) => {
    const row = rules.find((item) => item.path === name)
    if (!row) throw new Error(`Missing system rule: ${name}`)
    return row
  }
  const scales = ['space', 'radius', 'font', 'shadow'].map((name) => {
    const domain = rule(name).domain
    return `  ${name}?: Record<string, ${scalar(domain)}>`
  })
  const finite = ['border', 'padding', 'control', 'field', 'layout'].map((name) => {
    const item = rule(name)
    const keys = item.keys
      .split(';')[0]
      .split(',')
      .map((key) => key.trim())
    if (keys.some((key) => !/^[a-z][\w-]*$/.test(key)))
      throw new Error(`Invalid system keys: ${name}`)
    return `  ${name}?: { ${keys.map((key) => `${identifier(key)}?: ${scalar(item.domain)}`).join('; ')} }`
  })
  rule('focus')
  rule('density')
  rule('motion')
  rule('color')
  const colors = tokens
    .filter((name) => name.startsWith('--warp-color-'))
    .map((name) => name.slice('--warp-color-'.length))
  const durations = [
    ...new Set(
      tokens.flatMap((name) => {
        const match = /^--warp-duration-(.+)$/.exec(name) ?? /^--warp-(.+)-duration$/.exec(name)
        return match ? [match[1]] : []
      }),
    ),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const easings = [
    ...new Set(
      tokens.flatMap((name) => {
        const match = /^--warp-ease-(.+)$/.exec(name)
        if (match) return [match[1]]
        return (
          {
            '--warp-sweep-ease': ['sweep'],
            '--warp-sweep-ease-in': ['sweep-in'],
            '--warp-label-float-ease': ['label-float'],
          }[name] ?? []
        )
      }),
    ),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const dictionary = (names, type) =>
    `{ ${names.map((key) => `${identifier(key)}?: ${type}`).join('; ')} }`
  return [
    ...scales,
    ...finite,
    '  focus?: { width?: number | string; offset?: number | string; color?: string }',
    '  density?: { compact?: ThemeDensity; cozy?: ThemeDensity; comfortable?: ThemeDensity }',
    `  motion?: { scale?: number; press?: number; stagger?: number | string; staggerMax?: number; distance?: number | string; scaleFrom?: number; duration?: ${dictionary(durations, 'number | string')}; easing?: ${dictionary(easings, 'string')} }`,
    `  color?: ${dictionary(colors, 'string')}`,
    `  text?: Record<string, ThemeTextRole | undefined> & {\n${textRoles}\n  }`,
  ].join('\n')
}
