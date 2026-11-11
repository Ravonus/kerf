import type { PluginInstance } from '@kerf-js/core/plugin'

/** The no-ORM database client, as a plugin that fills `ctx.db`. */
export const native: () => PluginInstance<unknown>
/** The same as the named export. */
export default native
