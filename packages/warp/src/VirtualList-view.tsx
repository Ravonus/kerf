// Render the virtual list without adding an element or owner.
import { untrack, type State } from '@weft-js/core'
import type { VirtualKey, Virtualizer } from '@weft-js/warp-core'
import type { virtualData } from './VirtualList-data'
import type { VirtualListProps } from './VirtualList-types'
import { VirtualRow, VirtualProbe } from './VirtualList-rows'

type Refs = {
  el: HTMLElement | undefined
  list: HTMLElement | undefined
  readonly virtualizer: Virtualizer | undefined
}
type Bindings = {
  waiting: [HTMLElement, VirtualKey, (undo: () => void) => void][]
  pending: State<VirtualKey | undefined>
  active: State<VirtualKey | undefined>
  probes: Map<string, HTMLElement>
  onKeyDown: (event: KeyboardEvent) => void
}

/** Draw the list using its existing owner and live references. */
export function virtualView<T>(
  read: () => VirtualListProps<T>,
  data: ReturnType<typeof virtualData<T>>,
  refs: Refs,
  bindings: Bindings,
) {
  const props = untrack(read)
  const { keys, shown, rows, samples, probing } = data
  const { waiting, pending, active, probes, onKeyDown } = bindings
  const inner = untrack(() => props.inner)
  const listRole = () => props.role ?? (props.bareRows ? 'group' : 'list')
  /** A list's rows are its items (axe aria-required-children); `feed`, `log` and bare rows bring or need none. */
  const rowRole = () =>
    props.rowRole ?? (props.tag !== 'ol' && listRole() === 'list' ? 'listitem' : undefined)
  const listAttrs = listAttributes(props, inner, refs, listRole, rowRole)
  const rowContext = {
    get props() {
      return props
    },
    waiting,
    pending,
    active,
    shown,
    keys,
    rowRole,
    probes,
    get virtualizer() {
      return refs.virtualizer
    },
  }
  return (
    <div
      ref={(n) => (refs.el = n)}
      class={props.class}
      data-scope={props.scope ?? (props.part ? undefined : 'virtual')}
      data-part={props.part}
      data-variable={props.scope || props.part ? undefined : ''}
      role={inner ? undefined : listRole()}
      aria-label={inner ? undefined : props.label}
      aria-live={props.role === 'log' ? 'off' : undefined}
      aria-busy={!inner && props.busy ? 'true' : undefined}
      tabindex={untrack(() => props.roving) ? undefined : (props.tabindex ?? 0)}
      style={props.height ? `block-size:${props.height}` : undefined}
      onKeyDown={onKeyDown}
    >
      {untrack(() => props.tag) === 'ol' ? (
        <ol {...listAttrs()}>
          {rows.value.map((r) => (
            <VirtualRow key={r.key} row={r} context={rowContext} />
          ))}
          {probing.value &&
            samples.value.map((s) => <VirtualProbe key={s[0]} sample={s} context={rowContext} />)}
        </ol>
      ) : (
        <div {...listAttrs()}>
          {rows.value.map((r) => (
            <VirtualRow key={r.key} row={r} context={rowContext} />
          ))}
          {probing.value &&
            samples.value.map((s) => <VirtualProbe key={s[0]} sample={s} context={rowContext} />)}
        </div>
      )}
    </div>
  )
}

function listAttributes<T>(
  props: VirtualListProps<T>,
  inner: boolean | undefined,
  refs: Refs,
  listRole: () => string,
  rowRole: () => string | undefined,
) {
  return () => ({
    ref: (n: HTMLElement) => (refs.list = n),
    'data-part': 'spacer',
    'data-scope': props.listScope,
    role: inner
      ? listRole()
      : props.tag === 'ol'
        ? undefined
        : rowRole()
          ? 'presentation'
          : undefined,
    'aria-label': inner ? props.label : undefined,
    'aria-busy': inner && props.busy ? 'true' : undefined,
    style: 'position:relative;flex:none',
  })
}
