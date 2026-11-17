import { diagnostics as agent } from '../../packages/agent/src/diagnostics.mjs'
import { diagnostics as pay } from '../../packages/pay/src/diagnostics.mjs'
import { diagnostics as veneer } from '../../packages/veneer/src/plugin/diagnostics.mjs'
import { aliases, catalog, indexDiagnostics } from '../../packages/cli/src/catalog.mjs'

const providerDiagnostics = Object.entries({
  '@kerf-js/agent': agent,
  '@kerf-js/pay': pay,
  '@kerf-js/veneer': veneer,
}).flatMap(([plugin, entries]) => entries.map((entry) => ({ ...entry, plugin })))

/** Registry used by the public reference, including lookup aliases. */
export const referenceDiagnostics = indexDiagnostics([...catalog, ...providerDiagnostics], aliases)
