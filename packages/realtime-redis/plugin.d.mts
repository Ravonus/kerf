import type { PluginInstance } from '@weft-js/core/plugin'

declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** `redis()` for `weft.config.ts`: Redis as the `realtime.bus` provider, at `REDIS_URL`. */
export default plugin
