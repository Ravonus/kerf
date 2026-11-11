import { segmentEvents } from './events'
import { segmentView } from './view'
import {
  dayPeriods,
  hour12,
  isComplete,
  isEmpty,
  ymd,
  segmentParts,
  writeParts,
  type SegmentKind,
  type SegmentOptions,
  type SegmentPart,
} from '@kerf-js/veneer-core'
import { derived, flush, state, untrack } from '@kerf-js/core'

import type { SegmentState } from '../Segments'

export const afterRender = (fn: () => void) => {
  flush()
  fn()
}

function segmentModel({
  kind,
  locale,
  value,
  options,
  today,
  clears,
  disabled,
  readonly,
  onEdit,
  onBlurPartial,
}: {
  kind: () => SegmentKind
  locale: () => string
  value: () => string | null
  options: () => SegmentOptions | undefined
  today: () => string
  clears: () => number | undefined
  disabled: () => boolean | undefined
  readonly: () => boolean | undefined
  onEdit: (state: SegmentState, parts: SegmentPart[]) => void
  onBlurPartial: () => unknown
}) {
  const make = () =>
    writeParts(
      segmentParts(untrack(kind), untrack(locale), untrack(options)),
      untrack(kind),
      untrack(value),
    )
  const parts = state(make())
  const shape = derived(() => {
    const l = locale()
    return { periods: dayPeriods(l), h12: hour12(l, options()?.hourCycle), l }
  })
  let group: HTMLDivElement | undefined
  let edited = false
  const year = () => ymd(untrack(today))[0]
  const spins = () => [...group!.querySelectorAll<HTMLElement>('[data-part="segment"]')]
  const update = (next: SegmentPart[]) => {
    if (next === parts.value) return
    parts.value = next
    // the value this edit makes (null for a partial or impossible date) comes back through `value`: not a new value
    edited = true
    queueMicrotask(() => (edited = false))
    const st: SegmentState = isEmpty(next) ? 'empty' : isComplete(next) ? 'complete' : 'partial'
    onEdit(st, next)
  }
  const { onKey, onLeave, onPaste } = segmentEvents({
    parts,
    spins,
    year,
    update,
    group: () => group,
    readonly,
    disabled,
    kind,
    locale,
    today,
    onBlurPartial,
    make,
    value,
    clears,
    edited: () => edited,
  })
  return {
    parts,
    shape,
    onKey,
    onLeave,
    onPaste,
    setGroup: (node: HTMLDivElement) => (group = node),
  }
}

/**
 * A segment group (04 §1.3): each part a role=spinbutton, ordered by the locale. `onChange` hears every edit with the
 * group's state; the group only takes `value` when that value differs from what it holds, so a half-typed date stays.
 */
export function Segments({
  kind,
  locale,
  value,
  options,
  label,
  today,
  clears,
  required,
  disabled,
  readonly,
  onEdit,
  onBlurPartial,
}: {
  kind: SegmentKind
  locale: string
  value: string | null
  options?: SegmentOptions | undefined
  label?: string | undefined
  today: string
  clears?: number | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  readonly?: boolean | undefined
  onEdit: (state: SegmentState, parts: SegmentPart[]) => void
  onBlurPartial?: (() => unknown) | undefined
}) {
  const model = segmentModel({
    kind: () => kind,
    locale: () => locale,
    value: () => value,
    options: () => options,
    today: () => today,
    clears: () => clears,
    disabled: () => disabled,
    readonly: () => readonly,
    onEdit: (st, parts) => onEdit(st, parts),
    onBlurPartial: () => onBlurPartial?.(),
  })
  return segmentView({
    model,
    label: () => label,
    readonly: () => readonly,
    disabled: () => disabled,
    required: () => required,
  })
}
