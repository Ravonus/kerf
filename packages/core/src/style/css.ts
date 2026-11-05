// Group CSS at build: resolve intents and emit rules for the sites that use each group.
export {
  GroupError,
  didYouMean,
  resolveTraced,
  resolve,
  accentWords,
  reachable,
} from './css/base.ts'
export type { GroupSource, GroupUse, Def, Rule } from './css/base.ts'
export { emitGroups, emitAtomic } from './css/emit.ts'
export type { EmitOptions } from './css/emit.ts'
