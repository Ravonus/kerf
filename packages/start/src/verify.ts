// `live: { required: true, verify: … }`: a real round trip against a target that isn't production, as part of `kerf
// check` and `kerf build`. A marked row goes in through a connection of its own, as any outside app's would; each link
// from there to a refetch is timed, and the row comes out again.
//
//   trigger → write → notify → app → poke → refetch → denied → cleanup
//
// A database target tests the first half and a URL target the app's half; with both, the whole chain. Whatever wasn't
// tested is reported, by name. `live-target.mjs` decides whether a target may be touched at all.

import { CHANNEL } from './changes-sql.mjs'
import type { Context, Fn, VerifyOptions } from './data'
import type { Source } from './changes'
import { Broke, clean, insert, primaryKey, subscribe } from './verify/support'
import { waitNotice } from './verify/notify'
import { database } from './verify/database'
import { skipper, skipWithoutUrl } from './verify/skip'
import { cleanup } from './verify/cleanup'
import { timer } from './verify/timing'
import { checkTrigger } from './verify/trigger'
import { checkLive } from './verify/live'
import { openApp } from './verify/app'

export type { VerifyOptions }

/** Each step of the round trip, in order. */
export const LINKS = [
  'trigger',
  'write',
  'notify',
  'app',
  'poke',
  'refetch',
  'denied',
  'cleanup',
] as const
/** One step of the round trip. */
export type Link = (typeof LINKS)[number]

/** How a round trip went: the link it broke at, and what wasn't tested. */
export interface VerifyResult {
  ok: boolean
  /** The link that broke, and what it said. */
  broke?: { link: Link; why: string }
  ms: Partial<Record<Link, number>>
  untested: { link: Link; why: string }[]
}

/** What `roundTrip` needs: the query, the feed, and where the app is. */
export interface RoundTrip {
  fn: Fn
  source?: Source
  url?: string
  db?: string
  options: VerifyOptions
  env: Record<string, string | undefined>
}

/** The query's table: the first of its tags `changes` reports. */
function tableOf(fn: Fn, source: Source | undefined, input: unknown): string | undefined {
  const any = new Proxy({}, { get: (_, k) => (k === Symbol.toPrimitive ? () => '*' : '*') })
  let tags: readonly string[] = []
  try {
    tags =
      typeof fn.def.tags === 'function'
        ? fn.def.tags(input ?? any, any as Context)
        : (fn.def.tags ?? [])
  } catch {}
  const names = tags.map((t) => t.split(':')[0])
  return names.find((t) => t !== undefined && source?.tables.includes(t)) ?? names[0]
}

/** Writes a real row and follows it to a live client, naming the first link that breaks. */
export async function roundTrip({
  fn,
  source,
  url,
  db,
  options,
  env,
}: RoundTrip): Promise<VerifyResult> {
  const { input, timeout = 5000 } = options
  const marker = `kerf-verify-${crypto.randomUUID()}` // concurrent builds never touch each other's row
  const ms: VerifyResult['ms'] = {}
  const untested: VerifyResult['untested'] = []
  const cookie = env[options.cookie ?? 'KERF_STAGING_COOKIE']
  const other = env[options.otherCookie ?? 'KERF_STAGING_OTHER_COOKIE']
  const timed = timer(ms)
  const skip = skipper(untested)
  const { sql, listener } = database(db)
  const ac = new AbortController()
  let row: Awaited<ReturnType<typeof insert>> | undefined
  try {
    const table = tableOf(fn, source, input)
    if (!table) throw new Broke('trigger', `\`${fn.$id}\` has no tag naming a table`)
    const heard: string[] = []
    let hearing: (() => void) | undefined
    if (sql) {
      await timed('trigger', () => checkTrigger(sql, table))
      await listener!.listen(CHANNEL, (p) => {
        heard.push(p)
        hearing?.()
      })
    } else
      skip(
        ['trigger', 'write', 'notify', 'poke', 'refetch', 'denied', 'cleanup'],
        'no database target: nothing wrote a row, so only the app and its feed were checked. Set `STAGING_DATABASE_URL` or `verify.db`',
      )

    const live = url
      ? await timed('app', () =>
          openApp({ url, id: fn.$id, input, cookie, signal: ac.signal, timeout }),
        )
      : undefined
    skipWithoutUrl(url, sql, skip)

    if (!sql) {
      if (live) ac.abort()
      return { ok: true, ms, untested }
    }
    const denied =
      url && !(cookie && !other && !(fn.def.auth && fn.def.auth !== 'public'))
        ? await subscribe(url, fn.$id, input, other, ac.signal).catch(() => undefined)
        : undefined

    const pk = await primaryKey(sql, table)
    row = await timed('write', () => insert(sql, table, marker, options.row ?? {}, pk))
    await timed('notify', () =>
      waitNotice(heard, table, row!.id, timeout, (wake) => (hearing = wake)),
    )
    if (live)
      await checkLive({
        live,
        denied,
        timed,
        skip,
        url: url!,
        id: fn.$id,
        input,
        cookie,
        other,
        marker,
        timeout,
        options,
      })
    return { ok: true, ms, untested }
  } catch (e) {
    const b = e instanceof Broke ? e : new Broke('trigger', clean(e))
    return { ok: false, broke: { link: b.link, why: clean(b.message) }, ms, untested }
  } finally {
    await cleanup({ ac, row, ms, sql, listener, marker })
  }
}
