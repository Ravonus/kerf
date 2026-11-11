// Slot and wheel views for time fields.
import {
  dayPeriods,
  fieldName,
  fmtTime,
  hour12,
  listKey,
  pad,
  uid,
  type ChangeReason,
  type IsoTime,
} from '@kerf-js/veneer-core'
import { flush, onMount, state, untrack, type State } from '@kerf-js/core'

/** The slot list (04 TimeField): a listbox with an active option, not a row of tab stops. */
export function Slots({
  slots,
  selected,
  locale,
  hourCycle,
  label,
  onPick,
  meta,
}: {
  slots: string[]
  selected: string | null
  locale: string
  hourCycle?: string | undefined
  label: string
  onPick: (t: string, r: ChangeReason) => void
  meta?: boolean | undefined
}) {
  const id = uid('slots')
  const near = () =>
    Math.max(
      0,
      slots.findIndex((x) => x >= (untrack(() => selected) ?? '09:00')),
    )
  const active = state(untrack(near))
  let list: HTMLUListElement | undefined
  const show = (block: ScrollLogicalPosition) =>
    list?.querySelector<HTMLElement>('[data-active]')?.scrollIntoView?.({ block })
  const onKey = (e: KeyboardEvent) => {
    const m = listKey(e.key, active.value, slots.length)
    if (!m.handled) return
    e.preventDefault()
    if (m.pick) return onPick(slots[active.value]!, 'keyboard')
    active.value = m.to
    flush()
    show('nearest')
  }
  onMount(() => show('center'))
  return (
    <ul
      ref={(n) => (list = n)}
      data-part="listbox"
      role="listbox"
      tabindex="0"
      data-initial=""
      aria-label={label}
      aria-activedescendant={`${id}-${active.value}`}
      onKeyDown={onKey}
    >
      {slots.map((x, n) => (
        <Slot
          key={x}
          id={`${id}-${n}`}
          time={x}
          text={fmtTime(x, locale, hourCycle)}
          selected={x === selected}
          active={n === active.value}
          meta={meta}
          onPick={onPick}
        />
      ))}
    </ul>
  )
}
const Slot = ({
  id,
  time,
  text,
  selected,
  active,
  meta,
  onPick,
}: {
  id: string
  time: string
  text: string
  selected: boolean
  active: boolean
  meta?: boolean | undefined
  onPick: (t: string, r: ChangeReason) => void
}) => (
  <li
    role="option"
    id={id}
    aria-selected={selected ? 'true' : 'false'}
    data-active={active ? '' : undefined}
    onClick={() => onPick(time, 'pointer')}
  >
    {text}
    {meta && <span data-part="opt-meta">{time}</span>}
  </li>
)

/** The wheel sheet of a phone (04 §1.2): scroll-snap columns; arrows and presses work too. */
export function Wheels({
  value,
  locale,
  hourCycle,
  onChange,
}: {
  value: string | null
  locale: string
  hourCycle?: 'h12' | 'h23' | 'auto' | undefined
  onChange: (t: IsoTime) => void
}) {
  const h12 = untrack(() => hour12(locale, hourCycle))
  const start = untrack(() => value) ?? '09:30'
  const h0 = +start.slice(0, 2),
    m0 = (Math.round(+start.slice(3, 5) / 5) * 5) % 60
  const periods = untrack(() => dayPeriods(locale))
  const cols = [
    {
      key: 'hour',
      name: untrack(() => fieldName('hour', locale)),
      vals: h12 ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : Array.from({ length: 24 }, (_, i) => i),
      cur: state(h12 ? h0 % 12 || 12 : h0),
      show: (v: number) => (h12 ? String(v) : pad(v)),
    },
    {
      key: 'minute',
      name: untrack(() => fieldName('minute', locale)),
      vals: Array.from({ length: 12 }, (_, i) => i * 5),
      cur: state(m0),
      show: (v: number) => pad(v),
    },
    ...(h12
      ? [
          {
            key: 'dayPeriod',
            name: untrack(() => fieldName('dayPeriod', locale)),
            vals: [0, 1],
            cur: state(h0 >= 12 ? 1 : 0),
            show: (v: number) => periods[v],
          },
        ]
      : []),
  ]
  const commit = () => {
    let h = cols[0]!.cur.value
    if (h12) h = (h % 12) + (cols[2]!.cur.value ? 12 : 0)
    onChange(`${pad(h)}:${pad(cols[1]!.cur.value)}` as IsoTime)
  }
  return <div data-scope="wheels">{cols.map((c) => wheelColumn(c, commit))}</div>
}

function wheelColumn(
  c: {
    key: string
    name: string
    vals: number[]
    cur: State<number>
    show: (v: number) => string | undefined
  },
  commit: () => void,
) {
  let list: HTMLUListElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const row = () =>
    (list!.firstElementChild as HTMLElement | null)?.getBoundingClientRect().height || 40
  const select = (i: number, smooth: boolean) => {
    i = Math.max(0, Math.min(c.vals.length - 1, i))
    c.cur.value = c.vals[i]!
    list?.scrollTo?.({ top: i * row(), behavior: smooth ? 'smooth' : 'instant' })
    commit()
  }
  onMount(() =>
    list?.scrollTo?.({
      top: c.vals.indexOf(c.cur.value) * row(),
      behavior: 'instant' as ScrollBehavior,
    }),
  )
  const onScroll = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const i = Math.round(list!.scrollTop / row())
      if (c.vals[i] !== undefined && c.vals[i] !== c.cur.value) {
        c.cur.value = c.vals[i]
        commit()
      }
    }, 90)
  }
  const onKey = (e: KeyboardEvent) => {
    const d = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key]
    if (!d) return
    e.preventDefault()
    select(c.vals.indexOf(c.cur.value) + d, true)
  }
  return (
    <ul
      key={c.key}
      ref={(n) => (list = n)}
      role="listbox"
      tabindex="0"
      aria-label={c.name}
      onScroll={onScroll}
      onKeyDown={onKey}
    >
      {c.vals.map((v) => (
        <li
          key={v}
          role="option"
          aria-selected={c.cur.value === v ? 'true' : 'false'}
          onClick={() => select(c.vals.indexOf(v), true)}
        >
          {c.show(v)}
        </li>
      ))}
    </ul>
  )
}
