import type { Frame } from './canvas'
import type { Piece, Press, Scene, Word } from './stage'
import type { StageState } from './stage-state'
import { paintStage } from './stage-pieces'

type StageDrawContext = {
  v: StageState
  host: HTMLElement
  box: HTMLElement
  marks: { x: number; y: number; at: number }[]
  pointer: { x: number; y: number }
  lively: () => boolean
  gather: () => void
  read: (el: HTMLElement, base: DOMRect, ease: number, snap: boolean) => Piece
  settled: (p: Piece) => boolean
  scroller: () => Element | undefined
  color: (css: string) => string
  words: (el: HTMLElement) => Word[]
}

export function drawStage(frame: Frame, c: StageDrawContext) {
  const { v, host, box, marks, pointer, lively, gather, read, settled, scroller, color, words } = c
  const { ctx, width, height, dpr, dt, time: now } = frame
  v.dials = frame.tier
  if (v.hidden) {
    v.states = new WeakMap()
    v.appeared = now
    v.hidden = false
  }
  if (v.stale) gather()
  v.time = now
  v.cols = width
  v.rows = height
  v.unit = v.o.cell ? Math.max(1, Math.round(v.o.cell * dpr)) / dpr : 1
  const live = lively(),
    ease = live ? 1 - Math.exp(-dt * 16) : 1,
    base = box.getBoundingClientRect()

  let moving = marks.length > 0 || v.drag || now < v.busy
  const shown: Piece[] = []
  for (const el of v.pieces) {
    const p = read(el, base, ease, !!v.o.cell)
    if (p.y >= height || p.y + p.h < -8 || p.x >= width || p.x + p.w < -8 || !p.w || !p.h) continue
    p.seen = live ? Math.min(1, p.seen + dt / 0.45) : 1
    if (!settled(p) || (live && p.focus > 0.5)) moving = true
    shown.push(p)
  }
  const presses: Press[] = []
  for (let k = marks.length - 1; k >= 0; k--) {
    const age = (now - marks[k]!.at) / 0.6
    if (age >= 1) marks.splice(k, 1)
    else presses.unshift({ x: marks[k]!.x, y: marks[k]!.y, age })
  }
  const sc = scroller(),
    scroll = sc ? { top: sc.scrollTop, height: sc.scrollHeight, view: sc.clientHeight } : undefined
  let rail: Scene['rail']
  if (v.o.rail && scroll && scroll.height > scroll.view + 1) {
    const len = Math.max(height * 0.06, height * (scroll.view / scroll.height)),
      w = Math.max(2, 6 / v.unit)
    rail = {
      x: width - w - 2 / v.unit,
      w,
      top: (height - len) * (scroll.top / (scroll.height - scroll.view)),
      len,
      drag: v.drag,
    }
  }
  const scene: Scene = {
    ctx,
    width,
    height,
    unit: v.unit,
    time: now,
    dt,
    live,
    pieces: shown,
    pointer: {
      x: (pointer.x - base.left) / v.unit,
      y: (pointer.y - base.top) / v.unit,
      in: pointer.x > -1e4,
    },
    presses,
    scroll,
    rail,
    shown: now - v.appeared,
    color,
    words,
  }

  moving = paintStage(scene, v.o, moving)
  if (!v.painted) {
    v.painted = true
    host.setAttribute('data-state', 'live')
  }
  return moving
}
