import 'vitest'

declare module 'vitest' {
  /** What `dev-server.setup.mjs` provides. */
  interface ProvidedContext {
    url: string
  }
  /** `@kerf/core/test`'s matcher. */
  interface Assertion {
    toTouchAtMost(mutations: number, budget?: { runs?: number }): Promise<void>
  }
}
