// How many things a gate runs at once. `--jobs=N` or `WEFT_JOBS=N` sets it, and 1 runs everything one at a time. The
// default is half the cores this machine has free right now, at most 8, so a busy machine gets less piled on it.

import { availableParallelism, cpus, loadavg } from 'node:os'

const ticks = () => cpus().reduce((t, { times: c }) => ({ busy: t.busy + c.user + c.nice + c.sys, all: t.all + c.user + c.nice + c.sys + c.idle }), { busy: 0, all: 0 })
let last = ticks()

/** The share of the CPU in use, 0 to 1: over the next `ms`, blocking, or with none since the last call. For Windows, where loadavg is always 0. */
export function cpuBusy(ms) {
  if (ms) { last = ticks(); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }
  const now = ticks(), share = (now.busy - last.busy) / ((now.all - last.all) || 1)
  last = now
  return share
}

export function jobs(argv = process.argv, env = process.env) {
  const given = argv.find(a => a.startsWith('--jobs='))?.slice(7) ?? env.WEFT_JOBS
  if (given !== undefined && given !== '') {
    const n = Number(given)
    if (!Number.isInteger(n) || n < 1) throw new Error(`--jobs and WEFT_JOBS take a whole number from 1 up, not \`${given}\``)
    return n
  }
  const inUse = process.platform === 'win32' ? cpuBusy(500) * availableParallelism() : loadavg()[0]
  return Math.min(8, Math.max(1, Math.floor((availableParallelism() - inUse) / 2)))
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
