// The module `posters()` provides: `/// <reference types="@weft-js/capture/posters" />` in a page that imports it.
declare module 'virtual:weft/posters' {
  import type { ScenePoster } from '@weft-js/warp/scenes'

  const posters: Readonly<Record<string, ScenePoster>>
  /** The baked posters by scene id, already registered with `bakedPosters`. */
  export default posters
}
