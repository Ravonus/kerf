// The guards every model call passes: no reference material goes out, and no run spends more seat time or calls than
// it was given. Also the two errors the step throws.
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { sha256 } from './digest.mjs'

/** A guard refused an input or a prompt: nothing was sent. */
export class GenRefused extends Error {
  constructor(message, input) {
    super(message)
    this.name = 'GenRefused'
    this.input = input
  }
}

/**
 * A model call failed: `outcome` is `refused` (the model declined), `timeout`, `rate-limited`, `wrong-size` or
 * `failed`.
 */
export class GenFailure extends Error {
  constructor(outcome, message) {
    super(message)
    this.name = 'GenFailure'
    this.outcome = outcome
  }
}

const inside = (path, root) => {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep))
}

/**
 * A guard over reference folders, read once at run start: their real paths and the digest of every file in them.
 * `check({ path, bytes })` throws a `GenRefused` for an input inside a root, or with the same bytes as a file there.
 */
export function referenceGuard(roots = []) {
  const real = roots.map((root) => realpathSync(resolve(root)))
  const digests = new Set()
  for (const root of real)
    for (const name of readdirSync(root, { recursive: true })) {
      const file = join(root, String(name))
      if (statSync(file).isFile()) digests.add(sha256(readFileSync(file)))
    }
  return {
    check({ path, bytes }) {
      const name = path ?? 'an input given as bytes'
      if (path !== undefined) {
        const at = realpathSync(resolve(path))
        if (real.some((root) => inside(at, root)))
          throw new GenRefused(`keel gen: ${path} is inside a reference folder`, path)
      }
      const data = bytes ?? readFileSync(path)
      if (digests.has(sha256(data)))
        throw new GenRefused(`keel gen: ${name} has the same bytes as a reference file`, name)
    },
  }
}

/**
 * Seat usage for one run: calls and wall time against their caps. `fits(estimate)` gives why the next call would
 * cross a cap, or `undefined`; `spend(calls, tokens)` counts a call made.
 */
export function seatGuard({ maxCalls, maxWallMs }) {
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 0 || !(maxWallMs >= 0))
    throw new Error('keel gen: a run needs `maxCalls` and `maxWallMs`, the caps on seat use')
  const started = performance.now()
  const state = {
    calls: 0,
    tokens: { input: 0, output: 0 },
    elapsed: () => performance.now() - started,
    fits(estimate) {
      if (state.calls + estimate.calls > maxCalls)
        return `the next call would make ${state.calls + estimate.calls} calls, over maxCalls ${maxCalls}`
      const wall = Math.round(state.elapsed() + estimate.wallMs)
      if (wall > maxWallMs)
        return `the next call could end at ${wall} ms, over maxWallMs ${maxWallMs}`
      return undefined
    },
    spend(calls, tokens) {
      state.calls += calls
      state.tokens.input += tokens?.input ?? 0
      state.tokens.output += tokens?.output ?? 0
    },
    /** What is left of the wall cap, for the call's own deadline. */
    left: () => Math.min(2 ** 31 - 1, Math.max(1, Math.floor(maxWallMs - state.elapsed()))),
  }
  return state
}
