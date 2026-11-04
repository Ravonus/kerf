// Helpers for repository scripts; these are not part of a published package.
import { readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

export const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })

export const sleep = (ms) =>
  new Promise((ok) => {
    setTimeout(ok, ms)
  })

export const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Poll until a value is ready, retaining the gates' timeout and retry behavior. */
export async function until(what, fn, ms = 60_000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await Promise.resolve()
      .then(fn)
      .catch(() => undefined)
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise((ok) => {
      setTimeout(ok, 50)
    })
  }
}

// Resolve relative to this module, not the calling script.
export const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

export function walk(dir, each, skip = () => false) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!skip(entry.name)) walk(path, each, skip)
    } else if (entry.isFile()) each(path)
  }
}
