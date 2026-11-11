import type { PluginInstance } from '@kerf-js/core/plugin'

/** Binds the Firestore list source to `db.adapter@1`. */
declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
/** Installed under `db.adapter@1` by `kerf plugins sync`. */
export default plugin
