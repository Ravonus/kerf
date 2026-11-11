// The module `posters()` provides: `/// <reference types="@kerf-js/capture/posters" />` in a page that imports it.
declare module 'virtual:kerf/posters' {
  import type { ScenePoster } from '@kerf-js/veneer/scenes'

  const posters: Readonly<Record<string, ScenePoster>>
  /** The baked posters by scene id, already registered with `bakedPosters`. */
  export default posters
}
