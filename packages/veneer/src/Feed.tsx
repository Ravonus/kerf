import { untrack } from '@kerf/core'
import { VirtualList, type VirtualControl } from './VirtualList'
import './styles'
import '@kerf/veneer-core/styles/data/timeline.css'

/** One row of a Feed. */
export interface FeedItem {
  id: string | number
  /** Actor, verb and object: the bold line. */
  what: unknown
  when?: string
  /** The body, measured. */
  detail?: string
  tone?: string | undefined
}

/** Props for Feed. */
export interface FeedProps<T extends FeedItem> {
  items: readonly T[]
  label: string
  height?: string
  busy?: boolean | undefined
  /** Near the end: load more. */
  onEnd?: () => void
  /** Called when an item's measured height differs from the estimate, with both heights. For tuning. */
  onDrift?: (index: number, predicted: number, actual: number) => void
  /** Hands over a control to scroll to, focus or move between items from outside. */
  control?: (c: VirtualControl) => void
  /** An item's whole content. Default: knot, what, when, detail. */
  children?: (item: () => T) => unknown
}

/** A long activity feed (07 §4): the APG feed pattern on a window. Page Down and Up move between articles. */
export function Feed<T extends FeedItem>(props: FeedProps<T>) {
  const render = untrack(() => props.children)
  const keys = (e: KeyboardEvent, c: VirtualControl) => {
    if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault()
      c.move(e.key === 'PageDown' ? 1 : -1)
    }
  }
  return (
    <VirtualList
      tag="ol"
      inner
      role="feed"
      rowRole="article"
      listScope="timeline"
      label={props.label}
      height={props.height ?? '480px'}
      items={props.items}
      rowKey={(i) => i.id}
      text={(i) => i.detail ?? ''}
      estimate={56}
      busy={props.busy}
      onEnd={props.onEnd}
      onDrift={props.onDrift}
      control={props.control}
      roving
      onRowKey={keys}
    >
      {(item) =>
        render ? (
          render(item)
        ) : (
          <>
            <span data-part="knot" data-tone={item().tone}></span>
            <span data-part="what">{item().what}</span>
            <time data-part="when">{item().when}</time>
            <span data-part="detail" data-measure="">
              {item().detail}
            </span>
          </>
        )
      }
    </VirtualList>
  )
}
