import { writeContract } from '../contract.mjs'

export function makeRefresh(root, site, rust, say) {
  return async () => {
    const held = process.env.KERF_BUILD
    process.env.KERF_BUILD = '1' // the same as a build: server modules load, and nothing connects
    try {
      const { contract, diagnostics } = await writeContract({ root, site, rust })
      diagnostics.filter((d) => d.code.startsWith('R1')).forEach(say)
      return {
        contract,
        blocked: diagnostics.find((d) => /^R10[12]$/.test(d.code) && d.severity === 'error'),
      }
    } finally {
      if (held === undefined) delete process.env.KERF_BUILD
      else process.env.KERF_BUILD = held
    }
  }
}
