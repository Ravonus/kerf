// One axis of a scroller: where it is, how far it can go, what is animating it, and its bar's geometry.
import type { Axis, Easing } from './types'

export type Anim =
  | { kind: 'tween'; from: number; to: number; start: number; dur: number; ease: Easing }
  | { kind: 'coast'; v: number }
  | { kind: 'spring'; x0: number; v0: number; start: number }
  | { kind: 'auto'; v: number }

/** One axis: positions are physical (`scrollLeft` runs negative in right-to-left content). */
export interface AxisState {
  axis: Axis
  on: boolean
  pos: number
  written: number
  min: number
  max: number
  view: number
  total: number
  over: number
  v: number
  anim: Anim | null
  track: HTMLElement | null
  trackLen: number
  trackCross: number
  thumbOff: number
  thumbLen: number
  grow: number
  hover: boolean
  active: boolean
  drawn: string
  aria: number
  points: number[]
}

export const axisState = (axis: Axis): AxisState => ({
  axis,
  on: true,
  pos: 0,
  written: 0,
  min: 0,
  max: 0,
  view: 0,
  total: 0,
  over: 0,
  v: 0,
  anim: null,
  track: null,
  trackLen: 0,
  trackCross: 0,
  thumbOff: 0,
  thumbLen: 0,
  grow: 0,
  hover: false,
  active: false,
  drawn: '',
  aria: -1,
  points: [],
})
