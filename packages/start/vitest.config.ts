import { readFileSync, readdirSync } from 'node:fs'
import { configDefaults, defineConfig } from 'vitest/config'
import kerf from '@kerf/core/vite'

// Files that drive the shared fixture dev server run one at a time: a file's mutation shows up in another's
// DOM-write count. Everything else runs in parallel, beside them.
const tests = readdirSync('test')
  .filter((f) => /\.test\.(?:mjs|ts|tsx)$/.test(f))
  .map((f) => `test/${f}`)
const shared = tests.filter((f) => readFileSync(f, 'utf8').includes("inject('url')"))

const base = {
  environment: 'node',
  globals: true,
  testTimeout: 30_000,
  hookTimeout: 120_000,
} as const

export default defineConfig({
  // .tsx tests (the server-function cache under @kerf/core/test, jsdom) compile with kerf's plugin.
  plugins: [kerf()],
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache-start',
    projects: [
      {
        extends: true,
        test: {
          ...base,
          name: 'server',
          include: shared,
          globalSetup: ['test/dev-server.setup.mjs'],
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          ...base,
          name: 'unit',
          include: ['test/**/*.test.{mjs,ts,tsx}'],
          exclude: [...configDefaults.exclude, ...shared],
        },
      },
    ],
  },
})
