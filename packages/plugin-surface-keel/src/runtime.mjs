// surface.renderer@1 for `keel-pixel`. The renderer owns the GL context, so a surface adds only the fixed target.
import { createPixelRenderer } from '../vendor/keel-render.mjs'

/** The surface.renderer@1 provider: `context` makes the surface's `s.px` and undoes it when the surface goes. */
export const renderer = {
  context(canvas, def) {
    if (!def.pixel) throw new Error(`surface \`${def.name}\`: \`keel-pixel\` needs \`pixel: { width, height }\``)
    const px = createPixelRenderer(canvas, def.pixel)
    return { fields: { px }, dispose: () => canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext() }
  },
}
