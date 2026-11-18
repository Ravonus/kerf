import { diagnostic, sortDiagnostics, summarize } from './diag.mjs'
import { start } from './start.mjs'

/** The adoption inventory runs no app modules, compiler, runtime probes, or builds. */
export async function checkShell(root) {
  const started = performance.now()
  const { checkShellContracts } = await start(root, 'vite')
  /** @type {import("../../start/src/vite/shell-contracts.mjs").ShellContractFinding[]} */
  const findings = checkShellContracts(root)
  const diagnostics = findings.map((finding) =>
    diagnostic({
      code: finding.code,
      severity: finding.severity,
      file: finding.file,
      span: [finding.line, 1, finding.line, 1],
      why: `${finding.name}: ${finding.why}`,
    }),
  )
  sortDiagnostics(diagnostics)
  const files = new Set(findings.map((finding) => finding.file))
  const summary = { files: files.size, ...summarize(diagnostics) }
  return {
    version: 1,
    ok: summary.errors === 0,
    root,
    diagnostics,
    summary,
    ms: Math.round(performance.now() - started),
  }
}
