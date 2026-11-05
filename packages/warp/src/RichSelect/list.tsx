import type { ChangeReason } from '@weft-js/warp-core'
import { uid, listKey } from '@weft-js/warp-core'
import { state, derived, untrack, flush, onMount, type State } from '@weft-js/core'
import { SearchIcon, DownIcon } from '@weft-js/warp-icons'
import type { RichFieldProps, Bindable, Openable } from '../Picker'
import type { IconRef } from '../Icon'
import { usePickerEnv, bindable, useOpen, Composite, Hidden, Panel } from '../Picker'

export type Row = {
  key: string
  main: string
  sub?: string | undefined
  meta?: string | undefined
  code?: string
  pin?: string | undefined
  search: string
}

const SHOWN = 80

/**
 * The search list in a picker's panel (APG Combobox with a listbox popup): focus stays in the input, ↑/↓ move the
 * active option, Enter picks. Long lists render their first rows; typing narrows them.
 */
export function SearchList({
  label,
  placeholder,
  rows,
  value,
  match,
  onPick,
  count,
}: {
  label: string
  placeholder: string
  rows: () => Row[]
  value: string | null
  match?: ((r: Row, q: string) => boolean) | undefined
  onPick: (key: string, r: ChangeReason) => void
  count?: ((n: number, q: string) => string) | undefined
}) {
  const id = uid('list')
  const q = state('')
  const all = derived(() => rows())
  const hits = derived(() => {
    const s = q.value.trim().toLowerCase()
    return s ? all.value.filter((r) => (match ? match(r, s) : r.search.includes(s))) : all.value
  })
  const shown = derived(() => hits.value.slice(0, SHOWN))
  const active = state(
    untrack(() =>
      Math.max(
        0,
        all.value.slice(0, SHOWN).findIndex((r) => r.key === value),
      ),
    ),
  )
  let list: HTMLUListElement | undefined
  const show = () => list?.querySelector('[data-active]')?.scrollIntoView?.({ block: 'nearest' })
  const onKey = searchKeys(shown, active, () => onPick, show)
  onMount(show)
  return (
    <div class="tz-pop">
      <label data-part="search">
        <SearchIcon />
        <span class="sr">{label}</span>
        <input
          type="search"
          role="combobox"
          data-initial=""
          aria-expanded="true"
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={shown.value.length ? `${id}-${active.value}` : undefined}
          placeholder={placeholder}
          onInput={(e) => {
            q.value = e.currentTarget.value
            active.value = 0
          }}
          onKeyDown={onKey}
        />
      </label>
      <ul ref={(n) => (list = n)} data-part="listbox" role="listbox" id={id} aria-label={label}>
        {shown.value.map((r, n) => (
          <Option
            key={r.key}
            id={`${id}-${n}`}
            row={r}
            selected={r.key === value}
            active={n === active.value}
            onPick={onPick}
          />
        ))}
      </ul>
      {!shown.value.length && <p class="tz-empty">No match for “{q.value}”.</p>}
      {count && (
        <p class="tz-count" aria-live="polite">
          {count(hits.value.length, q.value)}
        </p>
      )}
    </div>
  )
}

function searchKeys(
  shown: { readonly value: Row[] },
  active: State<number>,
  onPick: () => (key: string, reason: ChangeReason) => void,
  show: () => void,
) {
  return (e: KeyboardEvent) => {
    const n = shown.value.length
    if (!n) return
    const m = listKey(e.key, active.value, n, { page: 8, wrap: true, typing: true })
    if (!m.handled) return
    e.preventDefault()
    if (m.pick) return onPick()(shown.value[active.value]!.key, 'keyboard')
    active.value = m.to
    flush()
    show()
  }
}

const Option = ({
  id,
  row,
  selected,
  active,
  onPick,
}: {
  id: string
  row: Row
  selected: boolean
  active: boolean
  onPick: (k: string, r: ChangeReason) => void
}) => (
  <li
    role="option"
    id={id}
    aria-selected={selected ? 'true' : 'false'}
    data-active={active ? '' : undefined}
    onClick={() => onPick(row.key, 'pointer')}
  >
    {row.pin && <span class="tz-pin">{row.pin}</span>}
    {row.code && <span data-part="code">{row.code}</span>}
    <span>
      {row.main}
      {row.sub && <small> {row.sub}</small>}
    </span>
    {row.meta && <span data-part="opt-meta">{row.meta}</span>}
  </li>
)

/** A field whose control is one value button over a search list: the frame of TimeZoneSelect and the Intl selects. */
export function ListField({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  icon,
  text,
  title,
  search,
  rows,
  match,
  count,
  hint,
  label,
  name,
  presentation,
  disabled,
  readonly,
  locale,
  today,
  ...rest
}: RichFieldProps &
  Bindable<string | null> &
  Openable & {
    icon?: IconRef | undefined
    text: (v: string, locale: string) => string
    title: string
    search: string
    rows: (locale: string, today: string) => Row[]
    match?: ((r: Row, q: string) => boolean) | undefined
    count?: ((n: number, q: string) => string) | undefined
    hint?: unknown
  }) {
  const env = usePickerEnv(
    () => locale,
    () => today,
  )
  const v = bindable<string | null>(
    () => value,
    () => defaultValue,
    null,
    () => onValueChange,
  )
  const pop = useOpen(
    () => open,
    () => defaultOpen,
    () => onOpenChange,
  )
  const shown = derived(() => (v.value ? text(v.value, env.locale.value) : ''))
  let trigger: HTMLButtonElement | undefined
  return (
    <ListFieldView
      rest={rest}
      icon={icon}
      label={label}
      hint={hint}
      disabled={disabled}
      readonly={readonly}
      name={name}
      shown={shown}
      value={v}
      pop={pop}
      env={env}
      title={title}
      search={search}
      rows={rows}
      match={match}
      count={count}
      presentation={presentation}
      onElement={(n) => (trigger = n)}
      getTrigger={() => trigger!}
    />
  )
}

function ListPanel({
  title,
  search,
  rows,
  match,
  count,
  env,
  value,
  pop,
  trigger,
  presentation,
}: {
  title: string
  search: string
  rows: (locale: string, today: string) => Row[]
  match?: ((r: Row, q: string) => boolean) | undefined
  count?: ((n: number, q: string) => string) | undefined
  env: ReturnType<typeof usePickerEnv>
  value: ReturnType<typeof bindable<string | null>>
  pop: ReturnType<typeof useOpen>
  trigger: () => HTMLButtonElement
  presentation: RichFieldProps['presentation']
}) {
  return (
    <Panel label={title} open={pop} trigger={trigger} presentation={presentation}>
      {() => (
        <SearchList
          label={search}
          placeholder={search}
          rows={() => rows(env.locale.value, env.today.value)}
          match={match}
          value={value.value}
          count={count}
          onPick={(k, r) => {
            value.set(k, r)
            pop.set(false)
          }}
        />
      )}
    </Panel>
  )
}

function ListControl({
  el,
  pop,
  shown,
  label,
  readonly,
  disabled,
  name,
  value,
}: {
  el: (n: HTMLButtonElement) => void
  pop: ReturnType<typeof useOpen>
  shown: string
  label: string
  readonly: boolean | undefined
  disabled: boolean | undefined
  name: string | undefined
  value: ReturnType<typeof bindable<string | null>>
}) {
  return (
    <>
      <button
        ref={(n) => el(n)}
        type="button"
        data-part="pick"
        aria-haspopup="dialog"
        aria-expanded={pop.value ? 'true' : 'false'}
        aria-label={`${label}, ${shown || 'none'}`}
        aria-disabled={readonly ? 'true' : undefined}
        disabled={disabled}
        onClick={() => {
          if (!readonly) pop.set(!pop.value)
        }}
      >
        <span>{shown}</span>
        <DownIcon />
      </button>
      <Hidden name={name} value={() => value.value ?? ''} />
    </>
  )
}

type ListFieldViewProps = {
  rest: Record<string, unknown>
  icon: IconRef | undefined
  label: string
  hint: unknown
  disabled: boolean | undefined
  readonly: boolean | undefined
  name: string | undefined
  shown: { readonly value: string }
  value: ReturnType<typeof bindable<string | null>>
  pop: ReturnType<typeof useOpen>
  env: ReturnType<typeof usePickerEnv>
  title: string
  search: string
  rows: (locale: string, today: string) => Row[]
  match: ((r: Row, q: string) => boolean) | undefined
  count: ((n: number, q: string) => string) | undefined
  presentation: RichFieldProps['presentation']
  onElement: (n: HTMLButtonElement) => void
  getTrigger: () => HTMLButtonElement
}
function ListFieldView({
  rest,
  icon,
  label,
  hint,
  disabled,
  readonly,
  name,
  shown,
  value,
  pop,
  env,
  title,
  search,
  rows,
  match,
  count,
  presentation,
  onElement,
  getTrigger,
}: ListFieldViewProps) {
  return (
    <Composite
      {...rest}
      icon={icon}
      label={label}
      hint={hint}
      disabled={disabled}
      readonly={readonly}
      bound={value}
      filled={!!value.value}
      hold={pop.value}
      control={() => (
        <ListControl
          el={onElement}
          pop={pop}
          shown={shown.value}
          label={label}
          readonly={readonly}
          disabled={disabled}
          name={name}
          value={value}
        />
      )}
      end={
        <ListPanel
          title={title}
          search={search}
          rows={rows}
          match={match}
          count={count}
          env={env}
          value={value}
          pop={pop}
          trigger={getTrigger}
          presentation={presentation}
        />
      }
    />
  )
}
