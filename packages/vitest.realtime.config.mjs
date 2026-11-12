// fsModuleCachePath resolves against each package that uses this, so every one keeps its own cache.
export default {
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
}
