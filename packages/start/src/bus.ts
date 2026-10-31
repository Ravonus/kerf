// The fan-out bus (research 30 §3): strings, at-most-once, ordered per publisher. Tags, topics, rings and cursors stay
// in the hub, so a bus is three methods. `@weft/realtime-redis`, `-nats` and `-durable-object` implement this interface.

export interface Bus {
  readonly name: string
  publish(channel: string, message: string): Promise<void>
  /**
   * Resolves once listening, with the way to stop. `gap` means messages may have been lost (a dropped connection):
   * the hub treats everything before it as out of the resume window.
   */
  subscribe(channel: string, on: (message: string) => void, gap?: () => void): Promise<() => void>
  close?(): Promise<void>
}

/** The bus a `realtime.bus` plugin provides, loaded on the first publish or subscribe: `weft build` reaches for neither. */
export function slotBus(plugin: string, load: () => Promise<Bus>): Bus {
  let bus: Promise<Bus> | undefined
  const get = () => (bus ??= load())
  return {
    name: plugin.replace(/^.*realtime-/, ''),
    publish: (channel, message) => get().then(b => b.publish(channel, message)),
    subscribe: (channel, on, gap) => get().then(b => b.subscribe(channel, on, gap)),
    close: () => (bus ? bus.then(b => b.close?.()) : Promise.resolve()),
  }
}

/** One process (PLAN §4.2). Delivered in a microtask: no code may rely on a fan-out no other bus has. */
export function memoryBus(): Bus {
  const channels = new Map<string, Set<(message: string) => void>>()
  return {
    name: 'memory',
    async publish(channel, message) {
      const list = channels.get(channel)
      if (list) queueMicrotask(() => { for (const on of list) on(message) })
    },
    async subscribe(channel, on) {
      let list = channels.get(channel)
      if (!list) channels.set(channel, (list = new Set()))
      list.add(on)
      return () => {
        list.delete(on)
        if (!list.size) channels.delete(channel)
      }
    },
  }
}
