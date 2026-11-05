import type { Frame } from './canvas'
import type { Piece } from './stage'
import type { StageState } from './stage-state'
import { readPiece, stageWords } from './stage-pieces'
import { drawStage } from './stage-draw'

const INK_PROBE = 'i'

export function stageRenderer(
  v: StageState,
  host: HTMLElement,
  box: HTMLElement,
  marks: { x: number; y: number; at: number }[],
  pointer: { x: number; y: number },
  lively: () => boolean,
  scroller: () => Element | undefined,
  getSizes: () => ResizeObserver | undefined,
) {
  function color(css: string) {
    let c = v.inks.get(css)
    if (c === undefined) {
      const probe = document.createElement(INK_PROBE)
      probe.hidden = true
      host.append(probe)
      probe.style.color = css.startsWith('--') ? `var(${css})` : css
      v.inks.set(css, (c = getComputedStyle(probe).color))
      probe.remove()
    }
    return c
  }

  const words = (el: HTMLElement) => stageWords(el, box, v.unit)

  function gather() {
    v.pieces = [...host.querySelectorAll<HTMLElement>('[data-skin]')].filter(
      (el) => el.closest('[data-scope="stage"]') === host,
    )
    getSizes()?.disconnect()
    getSizes()?.observe(box)
    for (const el of v.pieces) getSizes()?.observe(el)
    v.stale = false
  }

  const read = (el: HTMLElement, base: DOMRect, ease: number, snap: boolean) =>
    readPiece(el, base, ease, snap, v.states, host, v.unit, pointer, lively)
  const settled = (p: Piece) =>
    p.seen >= 1 && [p.hover, p.press, p.focus, p.on].every((value) => value === 0 || value === 1)

  const drawContext = {
    v,
    host,
    box,
    marks,
    pointer,
    lively,
    gather,
    read,
    settled,
    scroller,
    color,
    words,
  }
  const draw = (frame: Frame) => drawStage(frame, drawContext)

  return draw
}
