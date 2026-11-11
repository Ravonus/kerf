// surface.renderer@1 for `keel-lit`. keel/lit owns the GL context; the surface adds the canvas, its size and its clock.
import type { SurfaceRenderer } from '@weft-js/core/surface'
import * as lit from '../vendor/lit.mjs'

/** The surface.renderer@1 provider: `context` makes the surface's `s.lit` and `s.renderer`. */
export const renderer: SurfaceRenderer = {
  context(canvas, def) {
    let made: lit.LitRenderer
    try {
      made = lit.createLitRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        ...def.context,
      })
    } catch {
      return null
    }
    made.outputColorSpace = 'srgb'
    made.shadowMap.enabled = true
    made.shadowMap.type = 'pcf-soft'
    return {
      fields: { lit, renderer: made },
      resize(width, height, dpr) {
        made.setPixelRatio(dpr)
        made.setSize(width, height, false)
      },
      dispose() {
        made.dispose()
        made.forceContextLoss()
      },
    }
  },
}
