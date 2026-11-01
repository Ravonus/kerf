import type { PluginInstance } from 'weft/plugin'

declare const plugin: (options?: Record<string, never>) => PluginInstance<unknown>
export default plugin
