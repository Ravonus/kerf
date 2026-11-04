// `box.get(key)`, `box.set(fn)` and `state.linked`. The `weft` entry always has them; under the Vite plugin a module pulls
// them in by mentioning them, dotted, as `box['get']` or as `const { linked } = state` (vite.mjs `keyed`), so a page that uses
// none doesn't pay for them. A name only known at run time (`box[name]`) or a renamed `state` can't be seen: import this module yourself.
import { OWNKEYS } from './flags'
import { Box, DIRTY, listener, NONE, plain, reach, read, setKeyed, state } from './index'
import { linked } from './linked'

const own = (x: unknown) =>
  Reflect.ownKeys(x as object).flatMap((k): PropertyKey | PropertyKey[] =>
    typeof k === 'string' ? [k, +k] : k,
  )

type Entries = Record<PropertyKey, unknown> | null | undefined

Box.prototype.set = function (update) {
  const v: unknown = this.v
  const draft = Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? { ...v } : v
  update(draft)
  this.w(draft)
}

Box.prototype.get = function (key) {
  if (listener) {
    const k = (this.k ??= new Map())
    let s = k.get(key)
    if (!s) k.set(key, (s = { v: undefined, f: undefined, o: NONE, b: this, key }))
    read(s)
  }
  return this.v?.[key]
}

// Entry readers only: they re-run when their entry changed. Between plain objects only their own keys can differ, so
// those are compared instead of every reader's, unless the objects have been far larger than the readers.
setKeyed((box, prev, v) => {
  const k = box.k!
  const many = OWNKEYS &&
    k.size > 8 &&
    (box.c ?? 0) < k.size * 8 &&
    plain(prev) &&
    plain(v) && [...own(prev), ...own(v)]
  if (many) box.c = many.length
  for (const key of many || (k.keys() as Iterable<PropertyKey>)) {
    const s = k.get(key)
    if (s && !Object.is((prev as Entries)?.[key], (v as Entries)?.[key])) reach(s, DIRTY)
  }
})

state.linked = linked
