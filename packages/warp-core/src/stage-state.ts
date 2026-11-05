import type { Frame } from './canvas'
import type { Piece, StageOptions } from './stage'

export type StageState = {
  o: StageOptions
  time: number
  appeared: number
  hidden: boolean
  stale: boolean
  busy: number
  painted: boolean
  drag: boolean
  unit: number
  rows: number
  cols: number
  pieces: HTMLElement[]
  states: WeakMap<HTMLElement, Piece>
  inks: Map<string, string>
  dials: Frame['tier'] | undefined
}

export function createStageState(options: StageOptions): StageState {
  return {
    o: options,
    time: 0,
    appeared: 0,
    hidden: false,
    stale: true,
    busy: 0,
    painted: false,
    drag: false,
    unit: 1,
    rows: 0,
    cols: 0,
    pieces: [],
    states: new WeakMap(),
    inks: new Map(),
    dials: undefined,
  }
}
