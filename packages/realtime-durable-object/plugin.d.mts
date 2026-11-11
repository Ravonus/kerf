import type { PluginInstance } from '@kerf-js/core/plugin'

declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** `durableObject()` for `kerf.config.ts`: declares the `KERF_BUS` binding. The bus itself is set in `src/realtime.server.ts`. */
export default plugin
