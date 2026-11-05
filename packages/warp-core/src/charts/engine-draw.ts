import { patch, play } from './scene'
import { probe, radius } from './engine-observers'
import type { Ctx, Form, Plot } from './types'

/** State shared by chart drawing and its event handlers. */
export type ChartState<C> = { form: Form<C>; cfg: C; plot: Plot; width: number; stop: () => void }

/** Create the chart redraw operation. */
export function chartDraw<C>(
  fig: HTMLElement,
  svg: SVGSVGElement,
  ctx: Ctx,
  state: ChartState<C>,
  walk: () => void,
) {
  // Quiet swaps and reduced motion land at once; otherwise use 2.2 times the tween token.
  const duration = () => {
    const cs = getComputedStyle(fig)
    return cs.getPropertyValue('--warp-ref-data-fade').trim() === '0' ||
      cs.getPropertyValue('--warp-motion-scale').trim() === '0'
      ? 0
      : probe(fig, '--warp-data-tween', 'transitionDuration') * 1000 * 2.2
  }
  return (tween = false) => {
    ctx.r = radius(fig)
    state.plot = state.form.plot(state.cfg, state.width, ctx)
    const w = state.plot.w ?? state.width
    if (
      svg.getAttribute('height') !== String(state.plot.h) ||
      svg.getAttribute('width') !== String(w)
    ) {
      svg.setAttribute('viewBox', `0 0 ${w} ${state.plot.h}`)
      svg.setAttribute('width', String(w))
      svg.setAttribute('height', String(state.plot.h))
    }
    if (state.plot.style !== undefined && svg.getAttribute('style') !== state.plot.style)
      svg.setAttribute('style', state.plot.style)
    const stop = state.stop
    stop()
    const queue: Parameters<typeof patch>[2] = tween ? [] : undefined
    patch(svg, state.plot.body, queue)
    state.stop = queue ? play(queue, duration()) : () => {}
    walk()
  }
}
