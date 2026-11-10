import type { PluginInstance } from '@weft-js/core/plugin'

declare const plugin: (options?: {
  environment?: 'sandbox' | 'production'
  api?: string
  apiVersion?: string
}) => PluginInstance<unknown>
/** `square()` for `weft.config.ts`: Square as a `pay.rail` provider. Tokens stay in the environment. */
export default plugin
