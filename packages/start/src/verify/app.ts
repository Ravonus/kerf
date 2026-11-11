import { Broke, subscribe, type Hello } from './support'

export async function openApp(o: {
  url: string
  id: string
  input: unknown
  cookie: string | undefined
  signal: AbortSignal
  timeout: number
}) {
  const { url, id, input, cookie, signal, timeout } = o
  const a = await subscribe(url, id, input, cookie, signal)
  const hi = await a.until((f) => f[0] === 'h', timeout)
  if (!hi) throw new Broke('app', 'the app accepted the connection and said nothing')
  const said = (hi[1] as Hello).l
  if (said?.m !== 'feed' && said?.m !== 'external')
    throw new Broke(
      'app',
      `the app's live mode is \`${said?.m ?? 'app'}\`, not a feed: its log says why`,
    )
  if (said?.d) throw new Broke('app', "the app's change feed is down")
  const ack = await a.until(
    (f) => (f[0] === 'a' || f[0] === 'e') && (f[1] as unknown[])[0] === 1,
    timeout,
  )
  if (!ack) throw new Broke('app', 'no answer to the subscription')
  const answer = (ack[1] as [number, unknown])[1]
  const failed = answer as { code?: string; message?: string }
  if (ack[0] === 'e')
    throw new Broke(
      'app',
      failed.code === 'Q009'
        ? `the app doesn't know \`${id}\`: it runs another build`
        : failed.code === 'A002'
          ? `\`${id}\` needs a signed-in user: set \`KERF_STAGING_COOKIE\``
          : `the subscription failed: ${failed.message}`,
    )
  return { ...a, tags: answer as string[] }
}
