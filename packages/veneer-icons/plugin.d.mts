import type { PluginInstance } from '@kerf-js/core/plugin'

/** What `icons()` takes in kerf.config. */
export interface IconsOptions {
  /**
   * Compile one tier in: `@kerf-js/veneer-icons` then resolves to that tier alone, veneer's own icons included. Without
   * it every icon carries its three tiers and CSS shows the one for the nearest `data-expression`.
   */
  tier?: 'quiet' | 'balanced' | 'vivid'
  /** Where single icon files are served from, for names only known at runtime: an http(s) URL ending in `/`. */
  source?: string
}

/** `icons()` for `kerf.config.ts`: pins a tier if asked, and tells agents how the names work. */
export const icons: (options?: IconsOptions) => PluginInstance<IconsOptions>
/** The plugin, for `import veneerIcons from`. */
export default icons
