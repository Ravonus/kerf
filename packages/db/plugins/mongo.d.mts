import type { PluginInstance } from '@weft-js/core/plugin'

/** Binds the MongoDB list source to `db.adapter@1`. */
declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** Installed under `db.adapter@1` by `weft plugins sync`. */
export default plugin
