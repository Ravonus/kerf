import type { PluginEntry } from '@kerf-js/core/config'
import type * as lit from './lit'

/** The plugin for `kerf.config.ts`: adds the `keel-lit` surface kind. */
export declare const keel: () => PluginEntry

/** The KEEL modules this package ships: `@kerf-js/keel/modules/<id>`. */
export declare const MODULES: readonly string[]

declare module '@kerf-js/core/surface' {
  interface SurfaceKinds {
    /** `s.lit`: the keel/lit namespace. `s.renderer`: its renderer, bound to the surface's canvas. */
    'keel-lit': { lit: typeof lit; renderer: lit.LitRenderer }
  }
}
