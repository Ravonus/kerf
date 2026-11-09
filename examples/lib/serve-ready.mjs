import { sleep as wait } from '../../scripts/lib/helpers.mjs'

export async function waitReady({ v, url, firstPage, kill, alive, exit, t0 }) {
  for (;;) {
    if (!alive())
      throw new Error(`${v.name}: server exited (${exit()}) before answering, see ${v.log}`)
    if (performance.now() - t0 > 30000) {
      kill('SIGKILL')
      throw new Error(`${v.name}: server didn't answer on ${url} in 30s, see ${v.log}`)
    }
    try {
      if ((await fetch(url + firstPage, { signal: AbortSignal.timeout(2000) })).ok) break
    } catch {}
    await wait(50)
  }
}
