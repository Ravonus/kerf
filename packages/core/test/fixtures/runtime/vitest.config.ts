// Runs the runtime T001 fixture on its own (test/weft-test.test.tsx spawns it): the main suite never includes it.
import base from '../../../vitest.config.ts'

export default {
  ...base,
  test: {
    ...base.test,
    // Its own cache: core's suite spawns this run while its own run holds core's cache.
    fsModuleCachePath: 'node_modules/.vitest-cache-runtime-fixture',
    globalSetup: [],
    include: ['test/fixtures/runtime/*.fixture.tsx'],
  },
}
