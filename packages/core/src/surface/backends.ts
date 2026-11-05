import type { SurfaceRenderer } from '../surface'

// ---- backends ------------------------------------------------------------------------------------------------------

const canvas2d: SurfaceRenderer = {
  context(canvas, def) {
    const ctx = canvas.getContext('2d', def.context) as CanvasRenderingContext2D | null
    if (!ctx) return null
    let w = 0,
      h = 0
    return {
      fields: { ctx },
      resize(width, height, dpr) {
        w = width
        h = height
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      },
      begin() {
        if (def.clear !== false) ctx.clearRect(0, 0, w, h)
      },
    }
  },
}

const webgl2: SurfaceRenderer = {
  context(canvas, def) {
    const gl = canvas.getContext('webgl2', def.context) as WebGL2RenderingContext | null
    if (!gl) return null
    return {
      fields: { gl },
      resize() {
        gl.viewport(0, 0, canvas.width, canvas.height)
      },
      dispose() {
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      },
    }
  },
}

export const builtin: Record<string, SurfaceRenderer> = { canvas2d, webgl2 }
