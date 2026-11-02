import { surface, type Frame, type SurfaceOptions } from '@weft-js/warp-core/canvas'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/canvas/canvas.css'

export type { Frame, Pointer } from '@weft-js/warp-core/canvas'

/** Props for Canvas. */
export interface CanvasProps {
  /** Paints one frame: `ctx` is already scaled to CSS pixels. Return true to be called again without `animate`. */
  draw: (frame: Frame) => boolean | void
  /** Moves at balanced and vivid. Quiet and reduced motion paint one frame, with `still` set. */
  animate?: boolean
  fps?: number
  /** Whole-cell mode: `width` and `height` count cells of this many CSS pixels, scaled up without smoothing. */
  cell?: number
  /** Settings for the 2D context, such as `{ alpha: false }`. Read once, when the canvas attaches. */
  context?: SurfaceOptions['context']
  /** Called before the repaint when a theme, tier or motion dial changes around the canvas. Read colours again here. */
  onTheme?: () => void
  /** Track the pointer into `frame.pointer`, and repaint when it moves over the canvas. */
  pointer?: boolean
  /** Names the drawing (role="img"). Without one it is decorative. */
  label?: string | undefined
  [attr: string]: unknown
}

/** A canvas that handles pixel ratio, resize, off-screen and reduced motion, for anything warp doesn't draw itself (08 §6.7). */
export function Canvas({ draw, animate, fps, cell, context, onTheme, pointer, label, ...rest }: CanvasProps) {
  let node: HTMLCanvasElement | undefined
  use(surface, () => node, () => ({ draw, animate, fps, cell, context, onTheme, pointer }))
  return <div {...rest} data-scope="canvas"><canvas ref={(n: any) => (node = n)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}></canvas></div>
}
