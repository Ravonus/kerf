import { configDefaults, defineConfig } from 'vitest/config'

// test/.tmp holds the projects gate.test.ts writes; their own test files aren't this package's.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/.tmp/**'],
    testTimeout: 20000,
  },
})
