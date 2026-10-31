// How many things a gate runs at once. `--jobs=N` or `WEFT_JOBS=N` sets it, and 1 runs everything one at a time. The
// default is half the cores this machine has free right now, at most 8, so a busy machine gets less piled on it.

import { availableParallelism, loadavg } from 'node:os'

export function jobs(argv = process.argv, env = process.env) {
  const given = argv.find(a => a.startsWith('--jobs='))?.slice(7) ?? env.WEFT_JOBS
  if (given !== undefined && given !== '') {
    const n = Number(given)
    if (!Number.isInteger(n) || n < 1) throw new Error(`--jobs and WEFT_JOBS take a whole number from 1 up, not \`${given}\``)
    return n
  }
  return Math.min(8, Math.max(1, Math.floor((availableParallelism() - loadavg()[0]) / 2)))
}

/** `run` over `items`, at most `limit` at a time. Results keep the items' order; the first failure rejects. */
export async function pool(items, limit, run) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await run(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
