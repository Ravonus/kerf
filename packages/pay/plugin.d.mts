import type { PluginInstance } from '@kerf/core/plugin'

declare const plugin: (options?: Record<string, never>) => PluginInstance<unknown>
/** `pay()` for `kerf.config.ts`: the `pay.rail` slot, the PAY checks and the ledger's route. Rails are plugins of their own. */
export default plugin
