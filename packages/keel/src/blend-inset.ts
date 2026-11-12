// The section pass within a column: a paper panel as wide as the page's own panel, not the frame. The pass draws
// inside the column only (a scissor on the canvas; its own targets are untouched), and the frame it drew into its
// target is copied to the strips either side, so they show the scene with no panel, darkening or blur.
import type { SurfaceContext } from '@kerf-js/core/surface'
import type { LitRenderTarget } from './lit'

/** CSS px the panel keeps clear of the frame's left and right edges, or a function of the frame's CSS size. */
export type PanelInset =
  | readonly [left: number, right: number]
  | ((width: number, height: number) => readonly [number, number])

/** The frame as it was drawn, at its pixel: what the strips beside the column show. */
const COPY = `precision highp float;
uniform sampler2D tColor;
uniform vec2 uSize;
void main() { gl_FragColor = vec4(texture2D(tColor, gl_FragCoord.xy / uSize).rgb, 1.0); }`

/**
 * Draws a pass inside the column `inset` leaves, and the frame beside it.
 *
 * @param vertex section-post's full-frame vertex shader.
 */
export function createInset(s: SurfaceContext<'keel-lit'>, vertex: string, inset: PanelInset) {
  const { lit, renderer } = s
  const uniforms = { tColor: { value: null as unknown }, uSize: { value: [1, 1] } }
  const material = new lit.CustomMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: COPY,
    depthTest: false,
    depthWrite: false,
  })
  const quad = new lit.Mesh(lit.plane(2, 2), material)
  quad.frustumCulled = false
  const strips = new lit.Stage()
  strips.add(quad)
  const camera = new lit.OrthoCamera(-1, 1, 1, -1, 0, 1)
  const clip = (x: number, width: number, height: number) => {
    renderer.setScissorTest(true)
    renderer.setScissor(x, 0, width, height)
  }
  return {
    /** The column's edges this frame, CSS px from the left; null when it spans the frame. */
    column(width: number, height: number): readonly [number, number] | null {
      const [left, right] = typeof inset === 'function' ? inset(width, height) : inset
      const from = Math.max(0, Math.round(left))
      const to = Math.min(width, Math.round(width - right))
      return from <= 0 && to >= width ? null : [from, Math.max(from, to)]
    },
    /** Runs `pass` (which draws the frame through `frame`) inside the column, then copies the frame beside it. */
    draw(column: readonly [number, number], pass: (frame: () => void) => void, frame: () => void) {
      const { width, height } = s.size.value
      let target: LitRenderTarget | null = null
      clip(column[0], column[1] - column[0], height)
      pass(() => {
        target = renderer.getRenderTarget()
        frame()
      })
      if (target) {
        const ratio = renderer.getPixelRatio()
        uniforms.tColor.value = (target as LitRenderTarget).texture
        uniforms.uSize.value = [width * ratio, height * ratio]
        for (const [x, w] of [
          [0, column[0]],
          [column[1], width - column[1]],
        ] as const) {
          if (w <= 0) continue
          clip(x, w, height)
          renderer.render(strips, camera)
        }
      }
      renderer.setScissorTest(false)
    },
    dispose() {
      material.dispose()
      quad.geometry.dispose()
    },
  }
}
