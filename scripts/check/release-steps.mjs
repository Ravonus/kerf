// The steps only `pnpm run check --release` runs, both `alone`: they hold timing budgets, so runSteps starts them
// one at a time once the suites are done (check/steps.mjs).
import { QUIET_TESTS } from './tiers.mjs'

/** @param run check/run.mjs's run @param all allJobs at check.mjs's concurrency */
export const releaseSteps = (run, all) => [
  {
    id: 'instant-navigation',
    covers: 'landing scaffold navigation on Fast and Slow 3G',
    slow: true,
    release: true,
    // its budgets are paint times (response under 50 ms, skeleton under 100 ms): not beside the suites
    alone: true,
    fix: 'Run `pnpm --filter @weft-js/create test:e2e` and inspect the failures.',
    run: async () => {
      // the error comes last, after the scaffold's install and build output
      const r = await run('pnpm', ['--filter', '@weft-js/create', 'test:e2e'])
      return { problems: r.code === 0 ? [] : r.out.trim().split('\n').slice(-60) }
    },
  },
  {
    id: 'timing',
    covers: 'the test files that hold a timing budget (QUIET_TESTS in check/tiers.mjs), alone',
    slow: true,
    release: true,
    alone: true,
    fix: 'Run the file on its own: `cd packages/core && pnpm exec vitest run test/hmr.test.ts`.',
    run: () =>
      all(
        Object.entries(QUIET_TESTS).flatMap(([dir, files]) => files.map((f) => `${dir}/${f}`)),
        (path) => {
          const [, dir, file] = /^(packages\/[^/]+)\/(.+)$/.exec(path)
          return run('pnpm', ['exec', 'vitest', 'run', file], dir)
        },
      ),
  },
]
