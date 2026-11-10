import { CloseX } from './CloseX'
import { dialog, sheet, uid, type Detent } from '@weft-js/warp-core'
import { derived, type State, untrack } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/button.css' // the close button's markup
import '@weft-js/warp-core/styles/components/sheet.css'
import '@weft-js/warp-core/styles/components/dialog.css' // the backdrop and the parts a sheet shares with the dialog

type DrawerProps = {
  open: State<boolean>
  title: unknown
  description?: unknown
  footer?: unknown
  side?: 'auto' | 'right' | 'left' | 'bottom' | 'top'
  /** A bottom sheet's opening height when its content is taller than half the window: half (the page stays in view) or full. */
  at?: Detent
  /** At the half stop the page behind stays live: a reader can scroll it and tap in it while the sheet waits. */
  peek?: boolean
  /** Drawn open in the page's flow, not over it: no top layer, scrim or focus trap. For docs and previews. */ inline?: boolean
  children?: unknown
}

/** Where `side` puts the sheet now: auto is the bottom under 600px, decided as it opens. */
const placed = (side: NonNullable<DrawerProps['side']>) =>
  side === 'auto' ? (typeof innerWidth === 'number' && innerWidth < 600 ? 'bottom' : 'right') : side

/** The dialog (top layer, focus, Escape) and, at the bottom, the hand that drags it between its stops. */
function bind(
  props: {
    open: State<boolean>
    side: NonNullable<DrawerProps['side']>
    at: Detent
    peek: boolean
  },
  el: () => HTMLDialogElement | undefined,
) {
  const { open, side, at, peek } = props
  use(dialog, el, () => {
    const on = open.value
    const node = el()
    if (on && node) node.dataset.side = placed(side)
    return { open: on, onClose: () => (open.value = false) }
  })
  // a drawer fixed at a side never sits at the bottom: no sheet, and no second run on every open
  if (side !== 'bottom' && side !== 'auto') return
  // registered after dialog, so data-side is set before the sheet measures on opening
  use(sheet, el, () => ({ open: open.value, at, peek, onClose: () => (open.value = false) }))
}

/**
 * A sheet (05 §3 Drawer/Sheet; components.html:1092-1106): on a native <dialog>, at the side on wide screens and from
 * the bottom on phones (`side="auto"`: bottom under 600px, decided when it opens). The handle shows only at the
 * bottom. Initial focus goes to [autofocus], else the title, never the handle. `inline` draws it open in the page's flow,
 * for docs and previews: a non-modal <dialog open> at its side's shape, with no top layer, scrim or focus trap.
 */
export function Drawer({
  open,
  title,
  description,
  footer,
  side = 'auto',
  at = 'half',
  peek,
  inline,
  children,
}: DrawerProps) {
  const id = uid('sheet')
  const hasDescription = derived(() => description !== undefined)
  const foot = derived(() => footer) // one build of the footer, however often it is read
  let el: HTMLDialogElement | undefined
  const flat = untrack(() => !!inline)
  if (!flat)
    bind(
      untrack(() => ({ open, side, at, peek: !!peek })),
      () => el,
    )
  const closer = (e: Event) => {
    if (flat && (e.target as Element).closest?.('[data-close]')) open.value = false
  }
  return (
    <dialog
      ref={(n) => (el = n)}
      open={flat ? open.value : undefined}
      data-presentation={flat ? 'inline' : undefined}
      onClick={closer}
      data-scope="sheet"
      aria-labelledby={`${id}-t`}
      aria-describedby={hasDescription.value ? `${id}-d` : undefined}
      data-side={untrack(() => (side === 'auto' ? 'right' : side))}
    >
      <button
        type="button"
        data-part="handle"
        aria-label="Sheet height: tall. Press to shrink."
      ></button>
      <div data-part="header">
        <h2 data-part="title" id={`${id}-t`}>
          {title}
        </h2>
        {hasDescription.value && (
          <p data-part="description" id={`${id}-d`}>
            {description}
          </p>
        )}
        <button
          type="button"
          data-scope="button"
          data-emphasis="ghost"
          data-tone="neutral"
          data-icon-only=""
          aria-label="Close"
          data-part="close"
          data-close=""
        >
          <CloseX />
        </button>
      </div>
      <div data-part="body">{children}</div>
      {foot.value !== undefined && <div data-part="footer">{foot.value}</div>}
    </dialog>
  )
}
