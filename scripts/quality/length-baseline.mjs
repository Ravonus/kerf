// Compare measured violations with the committed baseline at a trusted Git base.

/** Reject malformed baselines rather than treating them as permission to grow. */
export function validateBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline))
    throw new Error('length baseline must be an object')
  for (const [id, value] of Object.entries(baseline)) {
    if (
      !/^(file|function):/.test(id) ||
      !value ||
      Object.keys(value).sort().join(',') !== 'lines,tokens' ||
      !Number.isSafeInteger(value.lines) ||
      value.lines <= 0 ||
      !Number.isSafeInteger(value.tokens) ||
      value.tokens < 0
    )
      throw new Error(`invalid length baseline entry: ${id}`)
  }
}

/** Preserve each offender's original limit across the package moves in Git history. */
export function renamedBaseline(baseline) {
  const renamed = {}
  for (const [id, value] of Object.entries(baseline)) {
    let key = id.replace(
      /^(file|function):packages\/(weft|icons|create-weft)\//,
      (_, kind, name) =>
        `${kind}:packages/${{ weft: 'core', icons: 'warp-icons', 'create-weft': 'create' }[name]}/`,
    )
    key = key.replace(
      /^(file|function):evals\/(apps|compare|speed)\//,
      (_, kind, name) => `${kind}:${name === 'apps' ? 'examples' : `benchmarks/${name}`}/`,
    )
    key = key.replace(/^(file|function):evals\/([\w-]+-exit(?:\.e2e)?\.mjs)/, '$1:evals/gates/$2')
    if (Object.hasOwn(renamed, key)) throw new Error(`duplicate length baseline entry: ${key}`)
    renamed[key] = value
  }
  return renamed
}

/** Return growth against the Git base and unapproved current findings. */
export function compareLengths(findings, baseline, base) {
  validateBaseline(findings)
  validateBaseline(baseline)
  validateBaseline(base)
  base = renamedBaseline(base)
  const problems = []
  for (const [id, value] of Object.entries(baseline)) {
    if (!Object.hasOwn(base, id)) problems.push(`baseline adds ${id}`)
    else
      for (const key of ['lines', 'tokens'])
        if (value[key] > base[id][key])
          problems.push(`baseline increases ${id} ${key}: ${base[id][key]} -> ${value[key]}`)
  }
  for (const [id, value] of Object.entries(findings)) {
    if (!Object.hasOwn(baseline, id))
      problems.push(`new length offender ${id}: ${value.lines} lines`)
    else
      for (const key of ['lines', 'tokens'])
        if (value[key] > baseline[id][key])
          problems.push(
            `length offender increased ${id} ${key}: ${baseline[id][key]} -> ${value[key]}`,
          )
  }
  return problems.sort()
}
