import type { PluginInstance } from '@kerf/core/plugin'

declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** `socketio()` for `kerf.config.ts`: puts the relay on the record of what the app reaches. A page passes the transport to `presence`. */
export default plugin
