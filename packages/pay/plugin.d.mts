import type { PluginInstance } from '@weft-js/core/plugin'

declare const plugin: (options?: Record<string, never>) => PluginInstance<unknown>
export default plugin
