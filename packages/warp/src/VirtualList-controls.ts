// Focus, keyboard navigation and edge notifications for a virtual list.
import { untrack, type State } from '@weft-js/core'
import type { VirtualKey, Virtualizer } from '@weft-js/warp-core'
import type { virtualData } from './VirtualList-data'
import type { VirtualControl, VirtualListProps } from './VirtualList-types'

const EDGE = 8

/** Create one list's navigation and edge callbacks. */
export function virtualControls<T>(
  read: () => VirtualListProps<T>,
  data: ReturnType<typeof virtualData<T>>,
  active: State<VirtualKey | undefined>,
  pending: State<VirtualKey | undefined>,
  refs: { readonly el: HTMLElement | undefined; readonly virtualizer: Virtualizer | undefined },
) {
  const props = untrack(read)
  const { keys, index } = data
  /** Bring a row into view if it isn't. Before its key has arrived this does nothing, and the keys effect comes back. */
  function reveal(key: VirtualKey) {
    const i = index.value.get(key)
    if (i === undefined || !refs.virtualizer) return
    const a = refs.virtualizer.anchor(),
      now = refs.virtualizer.sizes.offset(a.index) + a.within,
      top = refs.virtualizer.sizes.offset(i)
    if (top < now) refs.virtualizer.scrollTo(i, 'start')
    else if (top + refs.virtualizer.sizes.get(i)! > now + refs.el!.clientHeight)
      refs.virtualizer.scrollTo(i, 'end')
  }

  const control: VirtualControl = {
    scrollTo(key, align) {
      const i = index.value.get(key)
      if (i !== undefined) refs.virtualizer?.scrollTo(i, align)
    },
    scrollToEnd: () => refs.virtualizer?.scrollToEnd(),
    focus(key) {
      active.value = key
      pending.value = key
      refs.virtualizer?.update({})
      reveal(key)
    },
    move(by) {
      const all = keys.value,
        at = all.indexOf(active.value as VirtualKey)
      control.focus(
        all[
          Math.max(
            0,
            Math.min(all.length - 1, (at < 0 ? refs.virtualizer!.anchor().index : at) + by),
          )
        ]!,
      )
    },
    active: () => active.value,
  }

  function onKeyDown(e: KeyboardEvent) {
    if (props.roving && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const n = keys.value.length
      const to =
        e.key === 'ArrowDown'
          ? 1
          : e.key === 'ArrowUp'
            ? -1
            : e.key === 'Home'
              ? -n
              : e.key === 'End'
                ? n
                : 0
      if (to && (e.target as HTMLElement).closest?.('[data-part="row"]') === e.target) {
        e.preventDefault()
        control.move(to)
        return
      }
    }
    props.onRowKey?.(e, control)
  }

  const edges = edgeNotifier(props, keys)

  return { control, reveal, onKeyDown, edges }
}

function edgeNotifier<T>(
  props: VirtualListProps<T>,
  keys: ReturnType<typeof virtualData<T>>['keys'],
) {
  let askedStart = -1,
    askedEnd = -1
  function edges(indices: number[]) {
    const n = keys.value.length
    if (!n || !indices.length) return
    if (props.onEnd && indices.at(-1)! >= n - EDGE && askedEnd !== n) {
      askedEnd = n
      props.onEnd()
    }
    if (props.onStart && indices[0]! <= EDGE && askedStart !== n) {
      askedStart = n
      props.onStart()
    }
  }

  return edges
}
