/** Collect type diagnostics for one project. */
export function typeProblems(dir, result) {
  const diagnostics = result.out.split('\n').filter((line) => /error TS\d+/.test(line))
  // Examples and vendored generated text are intentionally outside this gate.
  const included = diagnostics.filter(
    (line) => !/^(?:evals|examples|packages\/text\/gen)\//.test(line),
  )
  if (result.code !== 0 && diagnostics.length === 0)
    return [`tsc -p ${dir} failed (exit ${result.code}): ${result.out.trim() || 'no output'}`]
  return included
}
