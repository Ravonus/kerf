import {
  formReset,
  isSegment,
  parseDate,
  parseTime,
  press,
  settle,
  writeParts,
  type IsoDate,
  type SegmentKind,
  type SegmentPart,
} from '@weft-js/warp-core'
import { type state, untrack, watch } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'

export function segmentEvents(
  parts: ReturnType<typeof state<SegmentPart[]>>,
  spins: () => HTMLElement[],
  year: () => number,
  update: (next: SegmentPart[]) => void,
  group: () => HTMLDivElement | undefined,
  readonly: () => boolean | undefined,
  disabled: () => boolean | undefined,
  kind: () => SegmentKind,
  locale: () => string,
  today: () => string,
  onBlurPartial: () => unknown,
  make: () => SegmentPart[],
  value: () => string | null,
  clears: () => number | undefined,
  edited: () => boolean,
) {
  // a new locale reorders the parts; a value from outside fills them
  watch(locale, (l, prev) => {
    if (prev !== undefined && l !== prev) parts.value = make()
  })
  watch(value, (v) => {
    if (!edited()) parts.value = writeParts(parts.value, untrack(kind), v)
  })
  watch(clears, (n, prev) => {
    if (prev !== undefined && n !== prev) parts.value = writeParts(parts.value, untrack(kind), null)
  })
  // a half-typed date has no value to go back through
  use(formReset, group, () => () => {
    parts.value = writeParts(parts.value, untrack(kind), untrack(value))
  })
  const onKey = (e: KeyboardEvent) => {
    if (readonly() || disabled()) return
    const at = spins().indexOf(e.target as HTMLElement)
    if (at < 0) return
    const r = press(parts.value, at, e.key, {
      year: year(),
      meta: e.metaKey || e.ctrlKey,
      rtl: getComputedStyle(group()!).direction === 'rtl',
    })
    if (!r.handled) return
    e.preventDefault()
    update(r.parts)
    if (r.move !== undefined) spins()[r.move]?.focus()
  }
  const onLeave = (e: FocusEvent) => {
    const at = spins().indexOf(e.target as HTMLElement)
    if (at >= 0) update(settle(parts.value, at, year()))
    if (group()!.contains(e.relatedTarget as Node)) return
    const st = parts.value.filter(isSegment)
    if (st.some((s) => s.value !== null) && st.some((s) => s.value === null)) onBlurPartial()
  }
  const onPaste = (e: ClipboardEvent) => {
    if (readonly() || disabled()) return
    e.preventDefault()
    const text = e.clipboardData?.getData('text') ?? ''
    const k = untrack(kind)
    const v =
      k === 'time'
        ? parseTime(text)
        : k === 'date'
          ? parseDate(text, locale(), today() as IsoDate)
          : (/^\d{4}-\d{2}/.exec(text)?.[0] ?? null)
    if (v) update(writeParts(parts.value, k, v))
  }
  return { onKey, onLeave, onPaste }
}
