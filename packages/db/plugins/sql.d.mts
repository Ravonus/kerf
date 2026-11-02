import type { PluginInstance } from 'weft/plugin'

declare const plugin: (options?: Record<string, unknown>) => PluginInstance<unknown>
export default plugin
