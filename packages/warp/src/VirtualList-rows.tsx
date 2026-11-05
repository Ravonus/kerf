// Row and measurement-probe views for the virtual list.
import { effect, onCleanup, onMount, untrack, type State } from '@weft-js/core'
import type { VirtualKey, Virtualizer } from '@weft-js/warp-core'
import type { VirtualListProps } from './VirtualList-types'

type RowContext<T> = {
  props: VirtualListProps<T>
  waiting: [HTMLElement, VirtualKey, (undo: () => void) => void][]
  pending: State<VirtualKey | undefined>
  active: State<VirtualKey | undefined>
  shown: State<VirtualKey[]>
  keys: { readonly value: VirtualKey[] }
  rowRole: () => string | undefined
  probes: Map<string, HTMLElement>
  readonly virtualizer: Virtualizer | undefined
}

/** A virtualized row with its existing owner and focus behavior. */
export function VirtualRow<T>(p: {
  row: { item: T; i: number; key: VirtualKey }
  context: RowContext<T>
}) {
  const { props, waiting, pending, active, shown, keys, rowRole } = untrack(() => p.context)
  let node: HTMLElement | undefined
  const key = untrack(() => p.row.key)
  onMount(() => {
    let undo: (() => void) | undefined
    const keep = (u: () => void) => (undo = u)
    const v = p.context.virtualizer
    if (v) keep(v.attach(node!, key))
    else waiting.push([node!, key, keep])
    onCleanup(() => undo?.())
    effect(
      () => pending.value === key,
      (go) => {
        if (!go) return
        pending.value = undefined
        ;(node!.querySelector<HTMLElement>('[data-focus]') ?? node!).focus()
      },
    )
  })
  const pos = () => p.row.i
  const place = untrack(
    () =>
      `position:absolute;inset-inline:0;inset-block-start:0;transform:translateY(${pos() * (props.estimate ?? 48)}px)`,
  ) // the first paint; the virtualizer owns it after
  const attrs = () => ({
    ref: (n: HTMLElement) => (node = n),
    'data-part': 'row',
    role: rowRole(),
    'aria-posinset': props.bareRows ? undefined : pos() + 1,
    'aria-setsize': props.bareRows ? undefined : props.open ? -1 : keys.value.length,
    'data-index': props.bareRows ? pos() + 1 : undefined,
    tabindex: props.roving
      ? active.value === key || (active.value === undefined && key === shown.value[0])
        ? 0
        : -1
      : undefined,
    style: place,
    onFocusIn: () => {
      active.value = key
    },
  })
  const body = props.children(() => p.row.item, pos)
  return props.tag === 'ol' ? <li {...attrs()}>{body}</li> : <div {...attrs()}>{body}</div>
}

/** A hidden row used for text measurement. */
export function VirtualProbe<T>(p: { sample: [string, T]; context: RowContext<T> }) {
  const { props, probes } = untrack(() => p.context)
  const [name, item] = untrack(() => p.sample)
  const body = props.children(
    () => item,
    () => 0,
  ) // once: measuring overwrites the row's text
  const attrs = {
    ref: (n: HTMLElement) => probes.set(name, n),
    'data-part': 'row',
    'data-probe': '',
    'aria-hidden': 'true',
    inert: true,
    style: 'position:absolute;inset-inline:0;inset-block-start:0;visibility:hidden;contain:layout',
  }
  return untrack(() => props.tag) === 'ol' ? (
    <li {...attrs}>{body}</li>
  ) : (
    <div {...attrs}>{body}</div>
  )
}
