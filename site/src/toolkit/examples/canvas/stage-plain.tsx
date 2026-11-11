import type { StagePainter } from '@kerf-js/veneer'
import { CanvasStage } from '@kerf-js/veneer'

// -- CanvasStage

// Skinned elements are plain HTML. The stage's CSS gives
// each skin its padding, radius and size from `--stage-*`
// properties, so markup needs no styles of its own; set
// those properties anywhere above to restyle every skin.

// The smallest stage: two painters, drawn with the plain
// 2D context, at each piece's box and in its states.
export const PLAIN: Record<string, StagePainter> = {
  button(p, s) {
    s.ctx.fillStyle = s.color(
      p.hover
        ? '--veneer-color-accent-solid-hover'
        : '--veneer-color-accent-solid',
    )
    s.ctx.beginPath()
    s.ctx.roundRect(p.x, p.y + p.press * 2, p.w, p.h, p.r)
    s.ctx.fill()
  },
  card(p, s) {
    s.ctx.shadowColor = 'rgb(0 0 0 / 0.18)'
    s.ctx.shadowBlur = 12 + p.hover * 12
    s.ctx.shadowOffsetY = 4 + p.hover * 4
    s.ctx.fillStyle = s.color('--veneer-color-surface')
    s.ctx.beginPath()
    s.ctx.roundRect(p.x, p.y, p.w, p.h, p.r)
    s.ctx.fill()
  },
}

export const CanvasStagePlain = () => (
  <CanvasStage
    painters={PLAIN}
    style="padding:32px"
  >
    <a
      href="#"
      data-skin="card"
      style="max-inline-size:340px"
      onClick={(e: MouseEvent) => e.preventDefault()}
    >
      <strong>storefront</strong>
      <span>
        Every border, shadow and fill here is painted on
        one canvas. The text, the link and the button are
        HTML.
      </span>
      <button data-skin="button">Deploy</button>
    </a>
  </CanvasStage>
)
