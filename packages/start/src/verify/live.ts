import type { VerifyOptions } from '../data'
import type { Link } from '../verify'
import { Broke, read, type subscribe } from './support'
import type { openApp } from './app'

type Timed = <T>(link: Link, run: () => Promise<T>) => Promise<T>
type Live = Awaited<ReturnType<typeof openApp>>
type Denied = Awaited<ReturnType<typeof subscribe>> | undefined

export async function checkLive(o: {
  live: Live
  denied: Denied
  timed: Timed
  skip: (links: Link[], why: string) => void
  url: string
  id: string
  input: unknown
  cookie: string | undefined
  other: string | undefined
  marker: string
  timeout: number
  options: VerifyOptions
}) {
  const { live, denied, timed, skip, url, id, input, cookie, other, marker, timeout, options } = o
  await timed('poke', async () => {
    const p = await live.until(
      (f) => f[0] === 'p' && (f[1] as { t: string[] }).t.some((t) => live.tags.includes(t)),
      timeout,
    )
    if (!p)
      throw new Broke(
        'poke',
        `the database notified, and the app never poked this subscription within ${timeout} ms: its listener, or a tag the query doesn't declare`,
      )
  })
  await timed('refetch', async () => {
    const end = Date.now() + timeout
    for (;;) {
      const res = await read(url, id, input, cookie)
      if (res.ok && (await res.text()).includes(marker)) return
      if (Date.now() > end)
        throw new Broke(
          'refetch',
          `poked, and the query didn't return the row within ${timeout} ms${options.row ? '' : ': if it filters by user, say whose it is in `verify.row`'}`,
        )
      await new Promise((ok) => {
        setTimeout(ok, 50)
      })
    }
  })
  if (denied)
    await timed('denied', async () => {
      const res = await read(url, id, input, other)
      const text = await res.text()
      if (text.includes(marker) || denied.frames.some((f) => JSON.stringify(f[1]).includes(marker)))
        throw new Broke('denied', `${other ? 'the other user' : 'a signed-out client'} got the row`)
    })
  else
    skip(
      ['denied'],
      'a query with no `auth` and no other user to compare: set `WEFT_STAGING_OTHER_COOKIE`',
    )
}
