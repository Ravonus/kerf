// @kerf-js/core/text's entry: a tiny detector that loads only the current engine's base chunk.
// Each engine chunk is built from Pretext specialised for that engine (scripts/specialize.mjs).
import { detectEngine, type EngineName } from './detect.js'
import type { TextEngine } from './types.js'

export type * from './types.js'
export { detectEngine }

let pending: Promise<TextEngine> | null = null
export function loadTextEngine(name: EngineName = detectEngine()): Promise<TextEngine> {
  // dist/<engine>/engine.js, built per engine by scripts/build.mjs; they exist only beside dist/index.js
  type M = Promise<{ engine: TextEngine }>
  return (pending ??= (
    name === 'webkit'
      ? // @ts-expect-error built output
        (import('./webkit/engine.js') as M)
      : name === 'gecko'
        ? // @ts-expect-error built output
          (import('./gecko/engine.js') as M)
        : // @ts-expect-error built output
          (import('./blink/engine.js') as M)
  ).then((m) => m.engine))
}
