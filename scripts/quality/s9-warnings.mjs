// Keep inventory output visible while treating execution failures as errors.
/** Build a warning-only check step; a failed process still fails the check. */
export function inventoryStep(name, run, print = console.log) {
  return {
    id: `s9-${name}`,
    covers: `${name} warning inventory`,
    fix: `Investigate the ${name} inventory execution failure.`,
    async run() {
      const result = await run(process.execPath, [`scripts/quality/${name}.mjs`])
      if (result.code !== 0)
        return { problems: [`${name} exited ${result.code}: ${result.out.trim() || 'no output'}`] }
      print(`\n${name} inventory:\n${result.out.trimEnd()}`)
      return { problems: [] }
    },
  }
}

/** Separate comment budget warnings without suppressing other diagnostics. */
export function splitCommentWarnings(diagnostics) {
  const warnings = [],
    rest = []
  for (const diagnostic of diagnostics) {
    if (diagnostic.code === 'weft(comment-budget)' && diagnostic.severity === 'warning')
      warnings.push(
        `${diagnostic.filename}:${diagnostic.labels?.[0]?.span.line ?? 0} ${diagnostic.message}`,
      )
    else rest.push(diagnostic)
  }
  return { warnings, rest }
}

/** Print warning diagnostics and leave errors for the existing lint check. */
export function reportCommentWarnings(report, print = console.log) {
  const { warnings, rest } = splitCommentWarnings(report.diagnostics)
  if (warnings.length) print(`\ncomment-budget lint warnings:\n${warnings.join('\n')}`)
  return { ...report, diagnostics: rest }
}

/** Run category warnings as part of the enforced lint step. */
export function categoryWarnings(run) {
  return inventoryStep('category-overrides', (cmd, args) => run(cmd, [...args, '--lint'])).run()
}
