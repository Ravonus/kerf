import { dayPeriods, fieldName, hour12, isComplete, isEmpty, isSegment, ymd, parseDate, parseTime, press, segmentParts, segmentText, segmentValueText, settle, writeParts, type SegmentKind, type SegmentOptions, type SegmentPart, type IsoDate } from '@weft/ui-core'
import { derived, flush, state, untrack, watch } from 'weft'

const keyOf = (p: SegmentPart) => (isSegment(p) ? p.type : `l${p.at}`)

export type SegmentState = 'empty' | 'partial' | 'complete'

/**
 * A segment group (04 §1.3): each part a role=spinbutton, ordered by the locale. `onChange` hears every edit with the
 * group's state; the group only takes `value` when that value differs from what it holds, so a half-typed date stays.
 */
export function Segments({ kind, locale, value, options, label, today, clears, disabled, readonly, onEdit, onBlurPartial }: { kind: SegmentKind; locale: string; value: string | null; options?: SegmentOptions; label?: string; today: string; clears?: number; disabled?: boolean; readonly?: boolean; onEdit: (state: SegmentState, parts: SegmentPart[]) => void; onBlurPartial?: () => void }) {
  const make = () => writeParts(segmentParts(untrack(() => kind), untrack(() => locale), untrack(() => options)), untrack(() => kind), untrack(() => value))
  const parts = state(make())
  const shape = derived(() => { const l = locale; return { periods: dayPeriods(l), h12: hour12(l, options?.hourCycle), l } })
  let group: HTMLDivElement | undefined
  let edited = false
  const year = () => ymd(untrack(() => today))[0]
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
  // a new locale reorders the parts; a value from outside fills them
  watch(() => locale, (l, prev) => { if (prev !== undefined && l !== prev) parts.value = make() })
  watch(() => value, v => { if (!edited) parts.value = writeParts(parts.value, untrack(() => kind), v) })
  watch(() => clears, (n, prev) => { if (prev !== undefined && n !== prev) parts.value = writeParts(parts.value, untrack(() => kind), null) })
  const onKey = (e: KeyboardEvent) => {
    if (readonly || disabled) return
    const at = spins().indexOf(e.target as HTMLElement)
    if (at < 0) return
    const r = press(parts.value, at, e.key, { year: year(), meta: e.metaKey || e.ctrlKey, rtl: getComputedStyle(group!).direction === 'rtl' })
    if (!r.handled) return
    e.preventDefault()
    update(r.parts)
    if (r.move !== undefined) spins()[r.move]?.focus()
  }
  const onLeave = (e: FocusEvent) => {
    const at = spins().indexOf(e.target as HTMLElement)
    if (at >= 0) update(settle(parts.value, at, year()))
    if (group!.contains(e.relatedTarget as Node)) return
    const st = parts.value.filter(isSegment)
    if (st.some(s => s.value !== null) && st.some(s => s.value === null)) onBlurPartial?.()
  }
  const onPaste = (e: ClipboardEvent) => {
    if (readonly || disabled) return
    e.preventDefault()
    const text = e.clipboardData?.getData('text') ?? ''
    const k = untrack(() => kind)
    const v = k === 'time' ? parseTime(text) : k === 'date' ? parseDate(text, locale, today as IsoDate) : /^\d{4}-\d{2}/.exec(text)?.[0] ?? null
    if (v) update(writeParts(parts.value, k, v))
  }
  return (
    <div ref={(n: any) => (group = n)} data-part="segments" role={label ? 'group' : undefined} aria-label={label} onKeyDown={onKey} onFocusOut={onLeave} onPaste={onPaste}>
      {parts.value.map(p => (isSegment(p)
        ? <span key={keyOf(p)} data-part="segment" data-type={p.type} role={readonly ? undefined : 'spinbutton'} tabindex={disabled ? undefined : '0'} inputmode="numeric" aria-label={fieldName(p.type, shape.value.l)} aria-valuemin={readonly ? undefined : p.min} aria-valuemax={readonly ? undefined : p.max} aria-valuenow={readonly || p.value === null ? undefined : p.value} aria-valuetext={readonly ? undefined : segmentValueText(p, shape.value.periods, shape.value.l, shape.value.h12)} aria-disabled={disabled ? 'true' : undefined} data-placeholder={p.value === null && !p.buf ? '' : undefined}>{segmentText(p, shape.value.periods, shape.value.h12)}</span>
        : <span key={keyOf(p)} data-part="literal" aria-hidden="true">{p.literal}</span>))}
    </div>
  )
}

export const afterRender = (fn: () => void) => { flush(); fn() }
