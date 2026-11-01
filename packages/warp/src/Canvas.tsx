import { surface, type Frame } from '@weft/ui-core/canvas'
import { use } from './use'
import './styles'
import '@weft/ui-core/styles/canvas/canvas.css'

export type { Frame } from '@weft/ui-core/canvas'

export interface CanvasProps {
  /** Paints one frame: `ctx` is already scaled to CSS pixels. Return true to be called again without `animate`. */
  draw: (frame: Frame) => boolean | void
  animate?: boolean
  fps?: number
  /** Names the drawing (role="img"). Without one it is decorative. */
  label?: string
  [attr: string]: unknown
}

/** A canvas that handles pixel ratio, resize, off-screen and reduced motion, for anything warp doesn't draw itself (08 §6.7). */
export function Canvas({ draw, animate, fps, label, ...rest }: CanvasProps) {
  let node: HTMLCanvasElement | undefined
  use(surface, () => node, () => ({ draw, animate, fps }))
  return <div {...rest} data-scope="canvas"><canvas ref={(n: any) => (node = n)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}></canvas></div>
}
