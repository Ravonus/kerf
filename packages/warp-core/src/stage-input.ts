import type { StageState } from './stage-state'
const EVENTS = [
  'focusin',
  'focusout',
  'input',
  'change',
  'toggle',
  'transitionrun',
  'animationstart',
  'keydown',
  'keyup',
] as const

type InputState = {
  unit: number
  rows: number
  cols: number
  rail: boolean
  drag: boolean
  time: number
}

export function stageInputState(v: StageState): InputState {
  return {
    get unit() {
      return v.unit
    },
    get rows() {
      return v.rows
    },
    get cols() {
      return v.cols
    },
    get rail() {
      return !!v.o.rail
    },
    get drag() {
      return v.drag
    },
    set drag(value) {
      v.drag = value
    },
    get time() {
      return v.time
    },
  }
}

export function stageInput(
  host: HTMLElement,
  box: HTMLElement,
  state: InputState,
  pointer: { x: number; y: number },
  marks: { x: number; y: number; at: number }[],
  scroller: () => Element | undefined,
  lively: () => boolean,
  stir: (e?: Event) => void,
  invalidate: () => void,
) {
  const at = (e: PointerEvent) => {
    const b = box.getBoundingClientRect()
    return { x: (e.clientX - b.left) / state.unit, y: (e.clientY - b.top) / state.unit }
  }
  const scrubTo = (e: PointerEvent) => {
    const sc = scroller()
    if (sc) sc.scrollTop = (at(e).y / state.rows) * sc.scrollHeight - sc.clientHeight / 2
  }
  const onRail = (e: PointerEvent) =>
    state.rail && !!scroller() && at(e).x >= state.cols - 12 / state.unit
  const move = (e: PointerEvent) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    if (state.drag) scrubTo(e)
    invalidate()
  }
  const down = (e: PointerEvent) => {
    if (onRail(e)) {
      state.drag = true
      e.preventDefault()
      scrubTo(e)
      document.addEventListener('pointermove', move)
      stir()
      return
    }
    if (lively()) marks.push({ ...at(e), at: state.time })
    stir()
  }
  const up = () => {
    if (state.drag) {
      state.drag = false
      document.removeEventListener('pointermove', move)
    }
    stir()
  }
  const leave = () => {
    pointer.x = pointer.y = -1e4
    invalidate()
  }
  const fonts = () => invalidate()
  host.addEventListener('pointermove', move, { passive: true })
  host.addEventListener('pointerdown', down)
  host.addEventListener('pointerleave', leave)
  document.addEventListener('pointerup', up)
  document.addEventListener('scroll', invalidate, { capture: true, passive: true })
  for (const name of EVENTS) host.addEventListener(name, stir, true)
  void document.fonts?.ready.then(fonts)

  return () => {
    host.removeEventListener('pointermove', move)
    host.removeEventListener('pointerdown', down)
    host.removeEventListener('pointerleave', leave)
    document.removeEventListener('pointerup', up)
    document.removeEventListener('pointermove', move)
    document.removeEventListener('scroll', invalidate, { capture: true })
    for (const name of EVENTS) host.removeEventListener(name, stir, true)
  }
}
