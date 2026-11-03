import type { PluginInstance } from '@weft-js/core/plugin'

/** Prisma as the app's database client, as a plugin that fills `ctx.db`. */
export const prisma: () => PluginInstance<unknown>
/** The same as the named export. */
export default prisma
