import type { PluginInstance } from '@kerf/core/plugin'

declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** `nats()` for `kerf.config.ts`: NATS as the `realtime.bus` provider, at `NATS_URL`. */
export default plugin
