import type { ChangeReason } from '@kerf/veneer-core'
import { state, untrack, derived, flush, type State } from '@kerf/core'
import { bindable, useOpen, usePickerEnv, Hidden, type Bindable, type Openable } from '../Picker'
import { Button } from '../Button'
import { LeftIcon, RightIcon, DownIcon } from '@kerf/veneer-icons'
import { pad, fmt, toIso } from '@kerf/veneer-core'

export type Cell = { v: string; text: string; name: string }

/**
 * The period grid (04 §2): a title with arrows over rows of cells, one tab stop. ←/→ ±1, ↑/↓ ± a row, PageUp/PageDown
 * a page, Enter/Space picks; cells are named in full.
 */
export function PeriodGrid({
  title,
  cells,
  columns,
  value,
  current,
  prev,
  next,
  onPage,
  onPick,
  wide,
}: {
  title: string
  cells: Cell[]
  columns: number
  value: string | null
  current: string
  prev: string
  next: string
  onPage: (d: number) => void
  onPick: (v: string, r: ChangeReason) => void
  wide?: boolean
}) {
  const at = state(untrack(() => value ?? current))
  let box: HTMLDivElement | undefined
  const rows = derived(() =>
    Array.from({ length: Math.ceil(cells.length / columns) }, (_, r) => ({
      k: cells[r * columns]!.v,
      cells: cells.slice(r * columns, r * columns + columns),
    })),
  )
  const stop = derived(() => (cells.some((c) => c.v === at.value) ? at.value : cells[0]!.v))
  const focus = () => {
    flush()
    box?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus()
  }
  const onKey = periodKeys({
    cells: () => cells,
    columns: () => columns,
    at,
    focus,
    onPage: () => onPage,
    onPick: () => onPick,
  })

  return (
    <div ref={(n) => (box = n)} data-scope="monthgrid" onKeyDown={onKey}>
      <PeriodGridHead title={title} prev={prev} next={next} onPage={onPage} />
      <div
        role="grid"
        aria-label={title}
        class={wide ? 'pg' : undefined}
        style={wide ? `--c:${columns}` : undefined}
      >
        {rows.value.map((r) => (
          <div key={r.k} role="row">
            {r.cells.map((c) => (
              <button
                key={c.v}
                type="button"
                role="gridcell"
                data-v={c.v}
                data-initial={c.v === stop.value ? '' : undefined}
                tabindex={c.v === stop.value ? '0' : '-1'}
                aria-selected={c.v === value ? 'true' : 'false'}
                aria-current={c.v === current ? 'date' : undefined}
                onClick={() => onPick(c.v, 'pointer')}
              >
                <span aria-hidden="true">{c.text}</span>
                <span class="sr">{c.name + (c.v === current ? ', this period' : '')}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function PeriodGridHead({
  title,
  prev,
  next,
  onPage,
}: {
  title: string
  prev: string
  next: string
  onPage: (d: number) => void
}) {
  return (
    <div data-part="head">
      <Button
        emphasis="ghost"
        size="sm"
        icon={LeftIcon}
        label={prev}
        data-icon=""
        onClick={() => onPage(-1)}
      />
      <b aria-live="polite">{title}</b>
      <Button
        emphasis="ghost"
        size="sm"
        icon={RightIcon}
        label={next}
        data-icon=""
        onClick={() => onPage(1)}
      />
    </div>
  )
}

function periodKeys({
  cells,
  columns,
  at,
  focus,
  onPage,
  onPick,
}: {
  cells: () => Cell[]
  columns: () => number
  at: State<string>
  focus: () => void
  onPage: () => (d: number) => void
  onPick: () => (v: string, r: ChangeReason) => void
}) {
  return (e: KeyboardEvent) => {
    const el = (e.target as Element).closest?.<HTMLElement>('[data-v]')
    if (!el) return
    const i = cells().findIndex((c) => c.v === el.dataset.v)
    const d = (
      { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns(), ArrowDown: columns() } as Record<
        string,
        number
      >
    )[e.key]
    if (d) {
      e.preventDefault()
      if (i + d < 0) onPage()(-1)
      else if (i + d >= cells().length) onPage()(1)
      else at.value = cells()[i + d]!.v
      focus()
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      onPage()(e.key === 'PageUp' ? -1 : 1)
      focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      at.value = cells()[e.key === 'Home' ? 0 : cells().length - 1]!.v
      focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick()(cells()[i]!.v, 'keyboard')
    }
  }
}

export const monthCells = (year: number, locale: string): Cell[] =>
  Array.from({ length: 12 }, (_, i) => ({
    v: `${year}-${pad(i + 1)}`,
    text: fmt(toIso(year, i + 1, 1), { month: 'short' }, locale),
    name: fmt(toIso(year, i + 1, 1), { month: 'long', year: 'numeric' }, locale),
  }))

export const yearOf = (v: string | null, today: string) => +(v ?? today).slice(0, 4)

/** The `pick` button of a field whose whole control opens its panel. */
export function PickButton({
  el,
  text,
  label,
  open,
  disabled,
  onToggle,
}: {
  el: (b: HTMLButtonElement) => void
  text: string
  label: string
  open: boolean
  disabled?: boolean | undefined
  onToggle: () => void
}) {
  return (
    <button
      ref={(n) => el(n)}
      type="button"
      data-part="pick"
      aria-haspopup="dialog"
      aria-expanded={open ? 'true' : 'false'}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <span>{text}</span>
      <DownIcon />
    </button>
  )
}

export function pickerBindings<T>({
  value,
  initial,
  changed,
  open,
  defaultOpen,
  onOpenChange,
  locale,
  today,
  fallback,
}: {
  value: () => Bindable<T>['value']
  initial: () => Bindable<T>['defaultValue']
  changed: () => Bindable<T>['onValueChange']
  open: () => Openable['open']
  defaultOpen: () => Openable['defaultOpen']
  onOpenChange: () => Openable['onOpenChange']
  locale: () => string | undefined
  today: () => string | undefined
  fallback: T
}) {
  const env = usePickerEnv(locale, today)
  const v = bindable<T>(value, initial, fallback, changed)
  const pop = useOpen(open, defaultOpen, onOpenChange)
  return { env, v, pop }
}

export function PickerControl({
  el,
  value,
  pop,
  text,
  label,
  disabled,
  name,
}: {
  el: (b: HTMLButtonElement) => void
  value: { readonly value: string | null }
  pop: { readonly value: boolean; set(v: boolean): void }
  text: string
  label: string
  disabled: boolean | undefined
  name: string | undefined
}) {
  return (
    <>
      <PickButton
        el={el}
        text={text}
        label={label}
        open={pop.value}
        disabled={disabled}
        onToggle={() => pop.set(!pop.value)}
      />
      <Hidden name={name} value={() => value.value ?? ''} />
    </>
  )
}
