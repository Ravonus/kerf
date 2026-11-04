import { bellCount, bellLabel, bump, popover, uid, type Align, type Side } from '@weft-js/warp-core'
import { derived, onMount, state, untrack, watch, type State } from '@weft-js/core'
import { Button } from '../Button'
import { Badge } from '../Badge'
import { use } from '@weft-js/warp-core/weft'
import { G, val } from './shared'
import '../styles'
import '@weft-js/warp-core/styles/components/popover.css'
import '@weft-js/warp-core/styles/app/bell.css'
import '@weft-js/warp-core/styles/app/badge.css'

/** Props for Bell. */
export interface BellProps {
  /** Unread count: a number, a State or a getter. */
  count?: number | { value: number } | (() => number | undefined)
  onOpen?: () => void
  /** The panel, usually `open => <Inbox variant="popover" open={open.value} … />`, shown in a Popover from the bell. */
  inbox?: (open: State<boolean>) => unknown
  /** On a phone the inbox is a page, not a popover (07 §4.3): below 600px the bell calls this instead of opening. */
  route?: () => void
  side?: Side | undefined
  align?: Align
}

/** Bell (07 §4.1): icon button and count badge, which bumps once per batch; its name says the count (§4.5). */
export function Bell({ count, onOpen, inbox, route, side = 'bottom', align = 'end' }: BellProps) {
  const id = uid('bell')
  const n = derived(() => Number(val<unknown>(count) ?? 0))
  const open = state(false)
  const panel = untrack(() => inbox)
  let button: HTMLButtonElement | undefined
  let box: HTMLDivElement | undefined
  let badge: HTMLElement | undefined
  use(
    popover,
    () => box,
    () => ({
      open: open.value,
      trigger: button!,
      side,
      align,
      onClose: () => (open.value = false),
    }),
  )
  onMount(() =>
    watch(
      () => n.value,
      (v, prev) => {
        if (prev !== undefined && v > prev && badge) bump(badge)
      },
    ),
  )
  const press = () => {
    const toPage =
      route && button!.ownerDocument.defaultView!.matchMedia?.('(max-width: 599.98px)').matches
    onOpen?.()
    if (toPage) route()
    else if (panel) open.value = !open.value
  }
  return (
    <span data-scope="bell">
      <Button
        emphasis="ghost"
        tone="neutral"
        data-icon-only=""
        ref={(el: HTMLButtonElement) => (button = el)}
        id={`${id}-b`}
        aria-label={bellLabel(n.value)}
        aria-haspopup={panel ? 'dialog' : undefined}
        aria-expanded={panel ? (open.value ? 'true' : 'false') : undefined}
        aria-controls={panel ? id : undefined}
        onClick={press}
      >
        <G name="bell" />
      </Button>
      <Badge
        emphasis="solid"
        count
        ref={(el: HTMLElement) => (badge = el)}
        hidden={n.value === 0}
        aria-hidden="true"
      >
        {bellCount(n.value)}
      </Badge>
      {panel && (
        <div
          ref={(el) => (box = el)}
          data-scope="popover"
          data-part="content"
          role="dialog"
          popover="manual"
          id={id}
          aria-label="Notifications"
        >
          {panel(open)}
        </div>
      )}
    </span>
  )
}
