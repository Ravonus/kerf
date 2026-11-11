import { open } from '../browser'

/** What @kerf/core/browser has open right now: listeners, intervals and subscribed values, with where they were made. */
export const leaks = (): string[] => [...open.values()].map(([what]) => what)

/**
 * T012: fail when subscriptions, listeners or intervals are still open (run after each test, once its renders are
 * unmounted). Closes them, so one leak doesn't fail the next test too.
 */
export function assertNoLeaks() {
  if (!open.size) return
  const list = leaks()
  for (const [, close] of Array.from(open.values())) close()
  throw new Error(
    `T012: the test ended with ${list.length} open subscription${list.length > 1 ? 's' : ''}, listener${list.length > 1 ? 's' : ''} or interval${list.length > 1 ? 's' : ''}:\n${list.map((w) => `  - ${w}`).join('\n')}\n` +
      '  fix: unmount what the test created (`render` unmounts itself; call the `dispose` of any `createRoot`), or fix the leak: create them in setup, where their owner removes them',
  )
}
