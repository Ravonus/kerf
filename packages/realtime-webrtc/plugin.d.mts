import type { PluginInstance } from '@kerf/core/plugin'

declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** `webrtc()` for `kerf.config.ts`: puts peers and ICE servers on the record of what the app reaches. A page passes the transport to `presence`. */
export default plugin
