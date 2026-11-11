// `@kerf-js/start/cache`: what `src/cache.server.ts` default-exports, the store behind `query({ cache })`.
// Memory (one process, bounded) unless the app picks another; `redisStore()` in @kerf-js/realtime-redis shares it.
export { memoryStore } from './exec/scope'
export type { MemoryLimits, Store, Stored } from './exec/scope'
