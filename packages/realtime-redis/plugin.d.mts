import type { PluginInstance } from '@kerf/core/plugin'

declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** `redis()` for `kerf.config.ts`: Redis as the `realtime.bus` provider, at `REDIS_URL`. */
export default plugin
