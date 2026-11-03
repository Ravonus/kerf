import type { PluginInstance } from '@weft-js/core/plugin'

declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** `durableObject()` for `weft.config.ts`: declares the `WEFT_BUS` binding. The bus itself is set in `src/realtime.server.ts`. */
export default plugin
