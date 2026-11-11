import { currentScope, StartError, type StandardSchemaV1 } from '../data'
import type { Ev, Hub } from '../hub'
import { RESET, tracked, type Tracked } from './tracked'

// ---- topics ---------------------------------------------------------------------------------------------------------

/** What `topic()` returns: publish on the server, follow with `.live`. */
export interface Topic<K, M> {
  /** Fan a message out to every subscriber, on every instance. */
  publish(key: K, message: M): Promise<void>
  /**
   * The messages of `keys`. Listens from this call, so a read that follows can't miss one (R006's gap): call it before
   * reading a backlog. With `after`, replays what the ring still has; outside the window the stream resets.
   */
  subscribe(
    keys: K | K[],
    options?: { signal?: AbortSignal | undefined; after?: string | undefined },
  ): AsyncGenerator<Tracked<M>, void, void>
  readonly name: string
  readonly message?: StandardSchemaV1<unknown, M>
}

type Out<S> = S extends StandardSchemaV1<unknown, infer O> ? O : never

/** A typed server channel: mutations, jobs and webhooks publish, streams read. */
export function makeTopic<
  K extends StandardSchemaV1<unknown, string | number>,
  M extends StandardSchemaV1,
>(name: string, def: { key?: K; message: M }, hub: () => Hub): Topic<Out<K>, Out<M>> {
  const path = (key: unknown) => `kerf:t:${name}:${String(key)}`
  return {
    name,
    message: def.message as StandardSchemaV1<unknown, Out<M>>,
    async publish(key, message) {
      const raw = JSON.stringify(message)
      const h = hub()
      if (raw.length > h.limits.message)
        throw new StartError(
          'R008',
          `a \`${name}\` message is ${raw.length} bytes; a message may be ${h.limits.message}`,
          'publish less, or an id subscribers fetch',
        )
      await h.bus.publish(path(key), raw)
    },
    subscribe(keys, { signal, after } = {}) {
      const h = hub()
      if (currentScope()?.touched?.read.size)
        currentScope()!.options.onDiagnostic?.({
          code: 'R006',
          severity: 'warning',
          message: `a stream read ${[...currentScope()!.touched!.read].join(', ')} before \`${name}.subscribe()\`: anything published in between is lost. Call \`subscribe\` first, or pass \`after\``,
        })
      const chans = (Array.isArray(keys) ? keys : [keys]).map((k) => h.channel(path(k)))
      const q: Ev[] = []
      let wake: (() => void) | undefined
      let lost = false
      const on = (ev: Ev | null) => {
        if (ev) q.push(ev)
        else lost = true
        if (q.length > h.limits.ring) lost = true
        wake?.()
      }
      for (const ch of chans) ch.listeners.add(on) // before anything is read: that's the rule
      const stop = () => {
        for (const ch of chans) h.unlisten(ch, on)
      }
      const abort = () => wake?.()
      signal?.addEventListener('abort', abort)
      return (async function* () {
        try {
          await Promise.all(chans.map((c) => c.ready))
          if (after) {
            const seen = new Set(q.map((e) => e.seq))
            for (const ch of chans) {
              const back = h.replay(ch, after)
              if (!back) throw RESET
              for (const ev of back) if (!seen.has(ev.seq)) q.push(ev)
            }
            q.sort((a, b) => a.seq - b.seq)
          }
          for (;;) {
            if (signal?.aborted) return
            if (lost) throw RESET
            const ev = q.shift()
            if (ev) yield tracked(h.cursorOf(ev.seq), JSON.parse(ev.raw))
            else
              await new Promise<void>((ok) => {
                wake = ok
              })
          }
        } finally {
          signal?.removeEventListener('abort', abort)
          stop()
        }
      })()
    },
  }
}
