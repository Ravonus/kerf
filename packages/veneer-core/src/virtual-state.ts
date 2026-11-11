import { Sizes } from './virtual-sizes'
import type { VirtualKey, VirtualOptions } from './virtual'

export type VirtualState = {
  el: HTMLElement
  o: VirtualOptions
  horizontal: boolean
  sizes: Sizes
  known: Map<VirtualKey, { size: number; cross: number }>
  rows: Map<VirtualKey, { el: HTMLElement; at: number; size: number }>
  keyOf: WeakMap<Element, VirtualKey>
  keys: readonly VirtualKey[]
  index: Map<VirtualKey, number>
  viewport: number
  cross: number
  lead: number
  trail: number
  last: number[]
  renamed: boolean
  stuck: boolean
  exact: number
}

export function createVirtualState(el: HTMLElement, initial: VirtualOptions): VirtualState {
  const o = { ...initial }
  return {
    el,
    o,
    horizontal: o.axis === 'x',
    sizes: new Sizes(),
    known: new Map(),
    rows: new Map(),
    keyOf: new WeakMap(),
    keys: [],
    index: new Map(),
    viewport: 0,
    cross: 0,
    lead: 0,
    trail: 0,
    last: [],
    renamed: false,
    stuck: o.from === 'end',
    exact: 0,
  }
}
