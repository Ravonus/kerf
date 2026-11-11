// `kerf db listen`: the change feed as a process of its own, for an app on functions, which can't hold a connection. It
// publishes pokes to the app's bus, so it needs a bus every instance reads, and its heartbeat is how the app knows it's up.

import type { Bus } from './bus'
import { createFeed, type Source } from './changes'
import { StartError } from './data'

const BEAT = 10_000

/** Listens until the returned `stop`. Run one: two listeners poke twice, which costs a refetch and loses nothing. */
export async function listen({
  changes,
  bus,
  say = console.info,
  beat = BEAT,
}: {
  changes: Source
  bus: Bus
  say?: (line: string) => void
  beat?: number
}) {
  if (bus.name === 'memory')
    throw new StartError(
      'R017',
      '`kerf db listen` publishes to the bus, and the memory bus stops at this process',
      'set `bus` in `src/realtime.server.ts`',
    )
  const how = await changes.probe()
  say(`kerf live: ${how.mode} (${how.via})${how.why ? `: ${how.why}` : ''}`)
  if (how.mode !== 'feed')
    throw new StartError(
      'R015',
      `this listener has no real feed${how.why ? `: ${how.why}` : ''}`,
      how.fix,
    )
  const feed = createFeed(changes, {
    emit: (p) =>
      void bus
        .publish('kerf:poke', JSON.stringify(p))
        .catch((e) => say(`kerf live: publish failed: ${e?.message ?? e}`)),
    status: (down) => say(down ? `kerf live: down: ${down}` : 'kerf live: back'),
  })
  await feed.start(how)
  const beats = setInterval(
    () => void bus.publish('kerf:poke', '{"v":1,"b":1}').catch(() => {}),
    beat,
  )
  await bus.publish('kerf:poke', '{"v":1,"b":1}')
  return async () => {
    clearInterval(beats)
    await feed.stop()
    await bus.close?.()
  }
}
