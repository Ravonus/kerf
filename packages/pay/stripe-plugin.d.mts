import type { PluginInstance } from '@kerf-js/core/plugin'

declare const plugin: (options?: {
  prices?: Record<string, string>
  api?: string
  apiVersion?: string
  tolerance?: number
}) => PluginInstance<unknown>
/** `stripe()` for `kerf.config.ts`: Stripe as a `pay.rail` provider. Keys stay in the environment. */
export default plugin
