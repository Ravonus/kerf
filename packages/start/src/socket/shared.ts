import type { Fn } from '../data'
import { stable } from '../data'
import { hub, type Hub } from '../hub'
import { check } from './check'
import { store, VALUE } from './rooms'
import type { Hubbed, Value } from './types'

const roomName = (id: string, params: unknown) => `kerf:c:${id}:${stable(params)}`

export function sharedWriter(stateOf: (h: Hub) => Hubbed) {
  /** A shared value written by the server: `deckSlide.in(key).set(3)`. */
  return async function setShared(fn: Fn, key: unknown, value: unknown) {
    const h = hub()
    const valid = await check(fn.def.key, key, `\`${fn.$id}\`'s key`)
    const v = await check(fn.def.value, value, `\`${fn.$id}\`'s value`)
    const st = stateOf(h),
      name = roomName(fn.$id, valid)
    const stamp: Value = {
      v,
      at: Math.max(Date.now(), (st.values.get(name)?.at ?? 0) + 1),
      o: h.epoch,
    }
    store(st, name, stamp)
    await h.bus.publish(name, JSON.stringify({ n: VALUE, m: stamp }))
  }
}
