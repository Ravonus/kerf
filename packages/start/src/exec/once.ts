/** Shared values being worked out now, by stored key. */
const running = new Map<string, Promise<{ v: unknown; tags: string[] }>>()

/**
 * Concurrent misses on one shared value run it once: a caller that finds a run already working on `key` waits for its
 * answer. If that run fails, the caller runs its own (errors aren't shared, as they aren't cached).
 */
export async function once(
  key: string,
  run: () => Promise<{ v: unknown; tags: string[] }>,
): Promise<{ v: unknown; tags: string[] }> {
  const theirs = running.get(key)
  if (theirs) {
    const answer = await theirs.catch(() => undefined)
    if (answer) return answer
  }
  const mine = run()
  running.set(key, mine)
  try {
    return await mine
  } finally {
    if (running.get(key) === mine) running.delete(key)
  }
}
