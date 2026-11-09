// Build the normalized schema from the marked tables and source census.
import { componentsPath } from './theme-schema-components.mjs'
import { declaredTokens } from './theme-schema-consumers.mjs'
import { sourceIndex, reconcile } from './theme-schema-index.mjs'
import { normalizeSite } from './theme-schema-normalize.mjs'
import { systemScales } from './theme-schema-system.mjs'

export const unquote = (text) => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1])
const cells = (line) =>
  line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim())

export function tables(design) {
  const marked = design
    .split('<!-- warp-theme-schema:begin -->')[1]
    ?.split('<!-- warp-theme-schema:end -->')[0]
  if (!marked) throw new Error('Missing schema markers')
  const rows = (header) => {
    const lines = marked.split('\n')
    const start = lines.findIndex((line) => line.startsWith(`| ${header} |`))
    if (start < 0) throw new Error(`Missing table: ${header}`)
    return lines
      .slice(
        start + 2,
        lines.findIndex((line, i) => i > start + 1 && !line.startsWith('|')),
      )
      .map(cells)
  }
  const expansion = marked.match(/```json\s*([\s\S]*?)```/)
  if (!expansion) throw new Error('Missing property expansion rules')
  return {
    parts: rows('Part'),
    properties: rows('config path'),
    sources: rows('source'),
    system: rows('system path'),
    states: rows('state'),
    inventory: rows('scope or standalone part'),
    expansion: JSON.parse(expansion[1]),
  }
}

function entries(parts) {
  const result = []
  const add = (part, state, property) => {
    const token = `--warp-${part}-${property}${state === 'rest' ? '' : `-${state}`}`
    result.push({
      part,
      state,
      path: property,
      token,
      domain:
        { underline: 'underline-role', border: 'border', ring: 'ring-role' }[property] ?? 'color',
      units:
        { underline: 'width/offset px', border: 'px width only', ring: 'width/offset px' }[
          property
        ] ?? 'forbidden',
      binding: 'unresolved',
    })
  }
  for (const [name, rest, states] of parts) {
    const part = unquote(name)[0]
    if (!part || !rest || !states) throw new Error('Invalid part row')
    for (const property of unquote(rest)) add(part, 'rest', property)
    if (states === 'none') continue
    for (const group of states.split(';')) {
      const [stateText, propText] = group.split(':')
      if (!propText) throw new Error(`Invalid state row: ${part}`)
      for (const state of unquote(stateText)) {
        for (const property of unquote(propText)) add(part, state, property)
      }
    }
  }
  const keys = result.map(({ part, state, path }) => `${part}.${state}.${path}`)
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate part path')
  return result
}

function indexSites(sources, bindings, table, records, tokens, read) {
  const declared = new Set(tokens)
  const inventory = new Set(table.inventory.flatMap((row) => unquote(row[0])))
  const sites = []
  const index = sources.map((source) => {
    const text = read(source)
    const found = sourceIndex(source, text)
    const comparison = reconcile(source, text, found)
    for (const site of found) {
      const matches = bindings.filter(
        (row) =>
          row.source === source &&
          row.classification === 'binding' &&
          row.property === site.property &&
          row.fallbackSpan?.[0] === site.fallbackSpan[0] &&
          row.fallbackSpan?.[1] === site.fallbackSpan[1] &&
          row.fallback === site.fallback &&
          row.selector === site.selectors.at(-1),
      )
      if (matches.length > 1) throw new Error(`Duplicate binding for site: ${site.id}`)
      if (matches.length === 1) {
        const { part, state, path, token, domain, units } = matches[0]
        site.classification = 'binding'
        site.role = { part, state, path, token, domain, units }
        site.reason = 'The reviewed binding matches the source site and selector.'
      } else {
        const candidate = normalizeSite(site, table.properties, inventory, declared)
        if (candidate) {
          const existing = records.find(
            (row) =>
              row.part === candidate.part &&
              row.state === candidate.state &&
              row.path === candidate.path,
          )
          if (existing) {
            candidate.token = existing.token
            if (existing.binding === 'unresolved') existing.binding = 'partial'
          } else records.push({ ...candidate, binding: 'partial' })
          site.classification = 'partial binding'
          site.role = candidate
          site.reason =
            'The simple-scope consumer maps to the property table; other sites remain unresolved.'
        }
      }
    }
    sites.push(...found)
    return {
      source,
      ...comparison,
      status: comparison.astOnly.length || comparison.sourceOnly.length ? 'discrepant' : 'indexed',
    }
  })
  return { sites, index }
}

export function makeRecords(table, bindings) {
  const allowedUnits = new Set([
    'forbidden',
    'width/offset px',
    'px width only',
    'px',
    'unitless',
    'ms for times',
    'ms',
    'px,deg',
  ])
  for (const row of table.properties) {
    if (!allowedUnits.has(row[3])) throw new Error(`Unknown unit: ${row[3]}`)
  }
  const shimBindings = bindings.filter((row) => row.part?.startsWith('text/'))
  const statusRow = table.inventory.find((row) => row[0] === '`status-light`')
  if (
    !statusRow ||
    statusRow[1] !== 'font-size' ||
    !table.properties.some((row) => row[0] === 'font.size')
  ) {
    throw new Error('status-light: design inventory mismatch')
  }
  const componentBindings = bindings.filter(
    (row) => row.source === componentsPath && row.classification === 'binding',
  )
  const classified = [...shimBindings, ...componentBindings]
  const records = [
    ...entries(table.parts),
    ...classified.map(({ part, state, path, token, domain, units }) => ({
      part,
      state,
      path,
      token,
      domain,
      units,
      binding: 'classified',
    })),
  ]
  for (const row of bindings.filter(
    (item) => item.source.endsWith('/links.css') && item.classification === 'binding',
  )) {
    const existing = records.find(
      (item) => item.part === row.part && item.state === row.state && item.path === row.path,
    )
    if (existing) existing.binding = 'partial'
    else
      records.push({
        part: row.part,
        state: row.state,
        path: row.path,
        token: row.token,
        domain: row.domain,
        units: row.units,
        binding: 'partial',
      })
  }
  return { records, shimBindings }
}

export function deriveRules(table, bindings, records) {
  const sources = table.sources
    .filter((row) => row[0].startsWith('`'))
    .map((row) => unquote(row[0])[0])
  if (sources.length !== 13 || new Set(sources).size !== 13)
    throw new Error('Expected 13 inventory sources')
  const textScale = table.system.find((row) => row[0] === 'text')
  const spaceScale = table.system.find((row) => row[0] === 'space')
  if (!textScale || !spaceScale) throw new Error('Missing text or space system table')
  const system = bindings
    .filter((row) => row.systemPath)
    .map((row) => ({
      path: row.systemPath,
      token: row.inputs[0].token,
      domain: row.domain,
      units: row.units,
      source: row.source,
      selector: row.selector,
      property: row.property,
      fallbackSpan: row.fallbackSpan,
    }))
  for (const row of system) {
    const [scale, key] = row.path.split('.')
    const keys = scale === 'text' ? textScale[1] : spaceScale[1]
    if (!keys.split(';')[0].split(',').includes(key))
      throw new Error(`Unknown system key: ${row.path}`)
  }
  const propertyRules = table.properties.map(([path, binding, domain, units]) => ({
    paths: path.split(',').map((value) => value.trim()),
    binding,
    domain,
    units,
  }))
  const systemRules = table.system.map(([path, keys, domain, binding]) => ({
    path,
    keys,
    domain,
    binding,
  }))
  const stateRules = table.states.map(([name, predicate, precedence]) => ({
    name,
    predicate,
    precedence: Number(precedence),
  }))
  if (
    stateRules.some((row) => !Number.isInteger(row.precedence)) ||
    new Set(stateRules.map((row) => row.name)).size !== stateRules.length ||
    table.expansion.version !== 1
  )
    throw new Error('Invalid expansion or state rules')
  const stateNames = stateRules.map((row) => row.name)
  for (const row of records) {
    if (!stateNames.includes(row.state)) throw new Error(`Unknown state: ${row.state}`)
  }
  return { sources, system, propertyRules, systemRules, stateRules }
}

export function makeRegistry(
  table,
  bindings,
  records,
  read,
  sources,
  systemRules,
  propertyRules,
  stateRules,
) {
  const tokens = [
    ...new Set(sources.flatMap((source) => declaredTokens(source, read(source)))),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const { sites, index } = indexSites(sources, bindings, table, records, tokens, read)
  const unresolved = records
    .filter((row) => row.binding !== 'classified')
    .map((row) => `${row.part}.${row.state}.${row.path}`)
  const groups = records.map((row) => {
    const matching = bindings.filter(
      (binding) =>
        binding.classification === 'binding' &&
        binding.part === row.part &&
        binding.state === row.state &&
        binding.path === row.path,
    )
    const siteIds = sites
      .filter(
        (site) =>
          site.role?.part === row.part &&
          site.role.state === row.state &&
          site.role.path === row.path,
      )
      .map((site) => site.id)
    return {
      ...row,
      id: `${row.part}.${row.state}.${row.path}`,
      siteIds,
      bindingRefs: matching.map(({ source, fallbackSpan }) => ({ source, fallbackSpan })),
    }
  })
  if (
    new Set(groups.map((row) => row.id)).size !== groups.length ||
    new Set(groups.map((row) => row.token)).size !== groups.length
  )
    throw new Error('Duplicate normalized group or token')
  const unresolvedSites = sites
    .filter((site) => !['binding', 'raw-only', 'excluded'].includes(site.classification))
    .map((site) => site.id)
  const status =
    unresolved.length || unresolvedSites.length || index.some((row) => row.status !== 'indexed')
      ? 'partial'
      : 'complete'
  const registry = {
    status,
    declaredTokens: tokens,
    systemScales: systemScales(systemRules, tokens),
    groups,
    unresolvedGroups: unresolved,
    unresolvedSites,
    sites,
    sourceIndex: index,
    propertyTable: table.properties,
    systemTable: table.system,
    stateTable: table.states,
    propertyRules,
    systemRules,
    stateRules,
    expansion: table.expansion,
  }
  return { registry, status, tokens, groups }
}
