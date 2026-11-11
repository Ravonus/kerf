import type { PluginInstance } from '@kerf-js/core/plugin'

declare const plugin: (options?: Record<string, never>) => PluginInstance<unknown>
/** `agent()` for `kerf.config.ts`: the app's assistant, its tools, grants, conversations and MCP endpoint. */
export default plugin
