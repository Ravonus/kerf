import { handles } from '../db/core'
import { liveHealth } from '../hub'

const LIMIT_MS = 2000

/** One database's answer: up, with how long `select 1` took, or down with why. */
async function probe(handle: { dialect: string; ping?: () => Promise<unknown> }) {
  if (!handle.ping) return { dialect: handle.dialect, ok: true }
  const started = performance.now()
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise((_, no) => {
      timer = setTimeout(() => no(new Error(`no answer in ${LIMIT_MS} ms`)), LIMIT_MS)
    })
    await Promise.race([handle.ping(), late]).finally(() => clearTimeout(timer))
    return { dialect: handle.dialect, ok: true, ms: Math.round(performance.now() - started) }
  } catch (e) {
    return { dialect: handle.dialect, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Readiness includes the required dependencies and startup state. Liveness performs no dependency work.
 */
export async function readiness(dev: boolean | undefined, started: boolean): Promise<Response> {
  if (!started) return probeResponse({ ok: false })
  const db = await Promise.all([...handles].map(probe))
  const live = liveHealth()
  const ok = db.every((d) => d.ok) && live.ok
  // A database's error can name its host: production says only that it's down.
  const shown = dev ? db : db.map(({ error: _error, ...d }) => d)
  return probeResponse({ ok, db: shown, live: { ok: live.ok, mode: live.mode } })
}

/** A dependency-free liveness response, or an uncached readiness result. */
export const probeResponse = <T extends { ok: boolean }>(body: T) =>
  Response.json(body, {
    status: body.ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
