import type { PluginInstance } from 'weft/plugin'

declare const plugin: (options?: { prices?: Record<string, string>; api?: string; apiVersion?: string; tolerance?: number }) => PluginInstance<unknown>
export default plugin
