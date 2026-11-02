import type { PluginInstance } from '@weft-js/core/plugin'

declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** `nats()` for `weft.config.ts`: NATS as the `realtime.bus` provider, at `NATS_URL`. */
export default plugin
