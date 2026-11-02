import type { PluginInstance } from '@weft-js/core/plugin'

declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** `webrtc()` for `weft.config.ts`: puts peers and ICE servers on the record of what the app reaches. A page passes the transport to `presence`. */
export default plugin
