import { state } from '@weft-js/core'
import { type VirtualKey, type Virtualizer } from '@weft-js/warp-core'
import { virtualMeasurements } from './VirtualList-measure'
import type { VirtualListProps } from './VirtualList-types'
import { virtualView } from './VirtualList-view'
import { virtualData } from './VirtualList-data'
import { mountVirtualList } from './VirtualList-mount'
import { virtualControls } from './VirtualList-controls'
import './styles'
import '@weft-js/warp-core/styles/data/virtual.css'

export type { VirtualControl, VirtualListProps } from './VirtualList-types'

/**
 * A long list (06 §9): one window of rows at known offsets. Give it `text` and rows have exact heights before they
 * exist; rows the engine can't size are measured when they render, and what's on screen never moves when one corrects.
 */
export function VirtualList<T>(props: VirtualListProps<T>) {
  let el: HTMLElement | undefined, list: HTMLElement | undefined
  let v: Virtualizer | undefined
  const waiting: [HTMLElement, VirtualKey, (undo: () => void) => void][] = []
  const active = state<VirtualKey | undefined>(undefined)
  const pending = state<VirtualKey | undefined>(undefined)

  const data = virtualData(() => props)

  const refs = {
    get el() {
      return el
    },
    set el(value: HTMLElement | undefined) {
      el = value
    },
    get list() {
      return list
    },
    set list(value: HTMLElement | undefined) {
      list = value
    },
    get virtualizer() {
      return v
    },
    set virtualizer(value: Virtualizer | undefined) {
      v = value
    },
  }
  const measure = virtualMeasurements(() => props, data, refs)
  const { probes } = measure

  const { control, reveal, onKeyDown, edges } = virtualControls(
    () => props,
    data,
    active,
    pending,
    refs,
  )

  mountVirtualList(() => props, data, measure, refs, {
    active,
    pending,
    waiting,
    control,
    reveal,
    edges,
  })

  return virtualView(() => props, data, refs, {
    waiting,
    pending,
    active,
    probes,
    onKeyDown,
  })
}
