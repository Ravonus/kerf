// The diagnostic catalog the agent layer knows about: PLAN §3.5 (W), §4.2 (W050–W056, T012), §7b (T001–T009,
// P001–P006), research 13 §4.4 (P100–P120), research 20 §6, §10 (H001–H008, H011–H016), PLAN §12 (H009, H010, H017, partial hydration), research 23 §3 (D020–D025, style groups), research 37 (D001–D039, the design language),
// research 11 §8.5 and 15 §7.5 as built in research 26 §7 (Phase 2's X-codes, M001–M013), research 27 §6 (Q001–Q010,
// server functions, and S011), research 28 §7 (Q011–Q015, the database; A001–A004, auth; C001–C002, the contract),
// research 29 §7 (S001, S002, S012, S013, state on the server; F001–F003, forms; M016–M018, the media route), research
// 30 §8 (W052, W053, T013, R001–R023, realtime), research 36 §8 and 39 (R101–R109, Rust), research 46 §12 (E001–E014, deploy), plus the codes proposed in research 17 (marked `proposed`).
//
// W-codes come from the compiler. Each has an `example` that should trigger it; `probe()` runs the installed
// compiler over the examples, so AGENTS.md and `docs` only claim what this weft version actually reports. T-codes
// come from `weft check`'s test pass (tests.mjs); their examples are test files, checked the same way.

import { compilerDiagnostics } from './catalog/compiler.mjs'
import { design } from './catalog/design.mjs'
import { styleGroups } from './catalog/style-groups.mjs'
import { tests } from './catalog/tests.mjs'
import { pluginConfig, pluginSlots } from './catalog/plugins.mjs'
import { hydration } from './catalog/hydration.mjs'
import { metadataHead, metadataCards } from './catalog/metadata.mjs'
import { audit } from './catalog/audit.mjs'
import { serverFunctions } from './catalog/server-functions.mjs'
import { serverState, stateTransport } from './catalog/state.mjs'
import { uiState } from './catalog/ui-state.mjs'
import { forms } from './catalog/forms.mjs'
import { databaseQueries, databaseSchema } from './catalog/database.mjs'
import { icons } from './catalog/icons.mjs'
import { auth } from './catalog/auth.mjs'
import { contracts } from './catalog/contracts.mjs'
import { realtime } from './catalog/realtime.mjs'
import { deploy } from './catalog/deploy.mjs'
import { rust } from './catalog/rust.mjs'
import { text } from './catalog/text.mjs'
import { media } from './catalog/media.mjs'

/** @typedef {{ code: string, severity: 'error' | 'warning' | 'info', catches: string, fix: string, by: 'compiler' | 'cli' | 'test' | 'gate' | 'start' | 'runtime' | 'plugin' | 'reserved', owner?: string, example?: string, proposed?: boolean }} Entry */

/** @type {Entry[]} */
export const catalog = [
  ...compilerDiagnostics,
  ...design,
  ...styleGroups,
  ...tests,
  ...pluginConfig,
  ...hydration,
  ...metadataHead,
  ...audit,
  ...metadataCards,
  ...serverFunctions,
  ...serverState,
  ...uiState,
  ...stateTransport,
  ...forms,
  ...databaseQueries,
  ...icons,
  ...databaseSchema,
  ...auth,
  ...contracts,
  ...realtime,
  ...deploy,
  ...rust,
  ...text,
  ...media,
  ...pluginSlots,
]

const byCode = new Map(catalog.map((e) => [e.code, e]))

/** W021–W029 share W020's entry. */
export function entry(code) {
  if (byCode.has(code)) return byCode.get(code)
  if (/^W02\d$/.test(code)) return byCode.get('W020')
  return undefined
}

/**
 * Which compiler codes the installed compiler reports: each example must produce its own code.
 * @param {{ transform: Function }} compiler
 * @returns {Record<string, { implemented: boolean, autofix: boolean, suggestion: boolean }>} autofix: a safe edit; suggestion: an edit to review
 */
export function probe(compiler) {
  const out = {}
  for (const e of catalog) {
    if (e.by !== 'compiler') continue
    if (e.code === 'W000') {
      out[e.code] = { implemented: true, autofix: false, suggestion: false }
      continue
    }
    if (!e.example) {
      out[e.code] = { implemented: false, autofix: false, suggestion: false }
      continue
    }
    const { diagnostics } = compiler.transform(e.example, {
      filename: 'probe.tsx',
      checkOnly: true,
    })
    const hit = diagnostics.find((d) => d.code === e.code)
    out[e.code] = {
      implemented: Boolean(hit),
      autofix: hit?.fix?.safe === true,
      suggestion: Boolean(hit?.fix) && hit.fix.safe !== true,
    }
  }
  return out
}
