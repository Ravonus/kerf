// Group CSS at build: resolve intents and emit rules for the sites that use each group.
export {
  GroupError,
  didYouMean,
  resolveTraced,
  resolve,
  accentWords,
  reachable,
} from './css/base.mjs'

export { emitGroups, emitAtomic } from './css/emit.mjs'
// Types are erased.
