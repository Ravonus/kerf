// `stream`, connected to `data.ts`. `q.live()` does the same `use` on its first call (see `live.ts`). A call, not a
// top-level statement: `sideEffects: false` lets a bundler skip this file's own statements for a re-export.

import { liveApi } from './data'
import { stream as define, use } from './live'

export const stream: typeof define = (def: any) => {
  use(liveApi)
  return define(def)
}

export { backoff, hold, type Link, type Stream, type StreamDef, type StreamFn, type StreamOptions, type StreamStatus } from './live'
