import type { PluginInstance } from '@kerf/core/plugin'

declare const plugin: (options?: {
  environment?: 'sandbox' | 'production'
  api?: string
  apiVersion?: string
}) => PluginInstance<unknown>
/** `square()` for `kerf.config.ts`: Square as a `pay.rail` provider. Tokens stay in the environment. */
export default plugin
