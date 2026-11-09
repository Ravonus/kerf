// Validate a finite source-site inventory and its public groups.
export function coverage({ sources, trackedSources, discovered, sites, groups }) {
  const issues = []
  const knownSources = new Set(sources)
  const tracked = new Set(trackedSources)
  const discoveredIds = new Set(discovered)
  if (!sources.length || !sites.length || !groups.length) issues.push('empty coverage inventory')
  for (const source of tracked)
    if (!knownSources.has(source)) issues.push(`missing source: ${source}`)
  for (const source of knownSources)
    if (!tracked.has(source)) issues.push(`extra source: ${source}`)
  if (discoveredIds.size !== discovered.length) issues.push('duplicate discovered site')
  const knownGroups = new Map()
  const tokens = new Set()
  if (knownSources.size !== sources.length) issues.push('duplicate source')
  for (const group of groups) {
    if (!group.id || knownGroups.has(group.id))
      issues.push(`duplicate or missing group: ${group.id}`)
    knownGroups.set(group.id, group)
    if (!group.token || tokens.has(group.token))
      issues.push(`duplicate or missing token: ${group.token}`)
    tokens.add(group.token)
    if (!group.domain || !group.units) issues.push(`missing domain or units: ${group.id}`)
    if (
      ![
        'color',
        'border',
        'underline-role',
        'ring-role',
        'width',
        'radius',
        'space',
        'margin',
        'length',
        'position',
        'family',
        'font-size',
        'weight',
        'leading',
        'tracking',
        'transform-case',
        'font-shorthand',
        'shadow',
        'time',
        'easing',
        'boolean',
        'scalar',
        'angle',
        'gradient',
        'length-list',
        'integer',
      ].includes(group.domain)
    ) {
      issues.push(`invalid domain: ${group.id}`)
    }
    if (
      ![
        'px',
        'forbidden',
        'unitless',
        'ms',
        'px,deg',
        'width/offset px',
        'px width only',
        'ms for times',
      ].includes(group.units)
    )
      issues.push(`invalid unit: ${group.id}`)
    if (group.status !== 'complete') issues.push(`unresolved group: ${group.id}`)
  }
  const seen = new Set()
  for (const site of sites) {
    if (!site.id || seen.has(site.id)) issues.push(`duplicate or missing site: ${site.id}`)
    seen.add(site.id)
    if (!discoveredIds.has(site.id)) issues.push(`unexpected site: ${site.id}`)
    if (!knownSources.has(site.source)) issues.push(`unknown source: ${site.source}`)
    if (!site.fallback) issues.push(`missing fallback: ${site.id}`)
    if (!['binding', 'raw-only', 'excluded'].includes(site.classification)) {
      issues.push(`unmapped site: ${site.id}`)
    }
    if (site.classification === 'binding' && !knownGroups.has(site.group)) {
      issues.push(`unknown group: ${site.id}`)
    }
    if (site.classification !== 'binding' && !site.reason) issues.push(`missing reason: ${site.id}`)
  }
  for (const id of discoveredIds) if (!seen.has(id)) issues.push(`missing site: ${id}`)
  for (const group of groups) {
    if (!sites.some((site) => site.group === group.id && site.classification === 'binding')) {
      issues.push(`group without binding: ${group.id}`)
    }
  }
  return { status: issues.length ? 'partial' : 'complete', issues }
}
