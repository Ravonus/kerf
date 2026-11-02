import { surface, type Frame } from '@weft-js/warp-core/canvas'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/canvas/canvas.css'

export type { Frame } from '@weft-js/warp-core/canvas'

/** Props for Canvas. */
export interface CanvasProps {
  /** Paints one frame: `ctx` is already scaled to CSS pixels. Return true to be called again without `animate`. */
  draw: (frame: Frame) => boolean | void
  animate?: boolean | undefined
  fps?: number
  /** Names the drawing (role="img"). Without one it is decorative. */
  label?: string | undefined
  [attr: string]: unknown
}

/** A canvas that handles pixel ratio, resize, off-screen and reduced motion, for anything warp doesn't draw itself (08 §6.7). */
export function Canvas({ draw, animate, fps, label, ...rest }: CanvasProps) {
  let node: HTMLCanvasElement | undefined
  use(surface, () => node, () => ({ draw, animate, fps }))
  return <div {...rest} data-scope="canvas"><canvas ref={n => (node = n)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}></canvas></div>
}
