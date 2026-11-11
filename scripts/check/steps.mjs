// Runs the chosen steps of scripts/check.mjs and prints what failed and how to fix it. Returns the exit code.

/** Run the steps in waves; report each in list order, then the failures. */
export async function runSteps(chosen, { requireTools, failOn }) {
  // The steps are independent: they run at once, and each reports in list order as the ones before it finish.
  const timed = async (step) => {
    const started = performance.now()
    let result
    try {
      result = await step.run()
    } catch (e) {
      result = { problems: [String(e?.stack ?? e)] }
    }
    return { result, seconds: ((performance.now() - started) / 1000).toFixed(1) }
  }
  // Three waves: the static steps read the tree while test suites write temporary files into it (Vite's config
  // timestamps, scaffolds), so the suites start once the static steps are done. Steps with timing budgets (`alone`)
  // run last, one at a time, on a machine the suites have left.
  const first = chosen
    .filter((step) => !step.slow && !step.alone)
    .map((step) => [step, timed(step)])
  const second = (async () => {
    await Promise.all(first.map(([, run]) => run))
    return new Map(
      chosen.filter((step) => step.slow && !step.alone).map((step) => [step, timed(step)]),
    )
  })()
  const third = (async () => {
    await Promise.all((await second).values())
    const runs = new Map()
    for (const step of chosen.filter((s) => s.alone)) {
      const run = timed(step)
      runs.set(step, run)
      await run
    }
    return runs
  })()
  const firstRuns = new Map(first)
  const running = chosen.map(async (step) =>
    firstRuns.has(step)
      ? firstRuns.get(step)
      : step.alone
        ? (await third).get(step)
        : (await second).get(step),
  )
  const results = []
  for (const [i, step] of chosen.entries()) {
    const { result, seconds } = await running[i]
    const count = result.problems?.length ?? 0
    console.log(
      `${step.id.padEnd(11)} ${
        result.skipped
          ? `skipped: ${result.skipped}`
          : count
            ? `${count} problem(s), ${seconds}s`
            : `ok, ${seconds}s${result.detail ? `; ${result.detail}` : ''}`
      }`,
    )
    results.push({ step, ...result })
  }

  const failed = results.filter((r) => r.problems?.length)
  const skipped = results.filter((r) => r.skipped)
  for (const { step, problems } of failed) {
    console.log(`\n${step.id}: ${problems.length} problem(s)`)
    for (const line of problems.slice(0, 60)) console.log(`  ${line}`)
    if (problems.length > 60)
      console.log(`  ... and ${problems.length - 60} more: pnpm run check --only=${step.id}`)
    console.log(`  how to fix: ${step.fix}`)
  }
  for (const { step, skipped: why } of skipped)
    console.log(`\n${step.id} did not run: ${why}. Install it: ${step.install}`)
  const missed = requireTools ? skipped.length : 0
  console.log(
    failed.length || missed
      ? `\npnpm run check: ${failed
          .map((r) => r.step.id)
          .concat(requireTools ? skipped.map((r) => r.step.id) : [])
          .join(', ')} failed`
      : `\npnpm run check: all passed${skipped.length ? `, ${skipped.length} skipped` : ''}`,
  )
  return failOn && (failed.length || missed) ? 1 : 0
}
