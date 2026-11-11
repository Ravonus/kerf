import type { PluginEntry } from '@weft-js/core/config'
import type * as lit from './lit'

/** The plugin for `weft.config.ts`: adds the `keel-lit` surface kind. */
export declare const keel: () => PluginEntry

/** The KEEL modules this package ships: `@weft-js/plugin-keel/modules/<id>`. */
export declare const MODULES: readonly string[]

declare module '@weft-js/core/surface' {
  interface SurfaceKinds {
    /** `s.lit`: the keel/lit namespace. `s.renderer`: its renderer, bound to the surface's canvas. */
    'keel-lit': { lit: typeof lit; renderer: lit.LitRenderer }
  }
}
