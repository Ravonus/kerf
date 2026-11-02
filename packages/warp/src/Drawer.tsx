import { XIcon } from '@weft-js/warp-icons'
import { dialog, uid } from '@weft-js/warp-core'
import { derived, type State, untrack } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/button.css' // the close button's markup
import '@weft-js/warp-core/styles/components/sheet.css'
import '@weft-js/warp-core/styles/components/dialog.css' // the backdrop and the parts a sheet shares with the dialog

/**
 * A sheet (05 §3 Drawer/Sheet; components.html:1092-1106): on a native <dialog>, at the side on wide screens and from
 * the bottom on phones (`side="auto"`: bottom under 600px, decided when it opens). The handle shows only at the
 * bottom. Initial focus goes to [autofocus], else the title, never the handle.
 */
export function Drawer({ open, title, description, footer, side = 'auto', children }: { open: State<boolean>; title: any; description?: any; footer?: any; side?: 'auto' | 'right' | 'left' | 'bottom'; children?: any }) {
  const id = uid('sheet')
  const hasDescription = derived(() => description !== undefined)
  const foot = derived(() => footer) // one build of the footer, however often it is read
  let el: HTMLDialogElement | undefined
  const placed = () => (side === 'auto' ? (typeof innerWidth === 'number' && innerWidth < 600 ? 'bottom' : 'right') : side)
  use(dialog, () => el, () => {
    const on = open.value
    if (on && el) el.dataset.side = placed()
    return { open: on, onClose: () => (open.value = false) }
  })
  return (
    <dialog ref={(n: any) => (el = n)} data-scope="sheet" aria-labelledby={`${id}-t`} aria-describedby={hasDescription.value ? `${id}-d` : undefined} data-side={untrack(() => (side === 'auto' ? 'right' : side))}>
      <button type="button" data-part="handle" aria-label="Sheet height: tall. Press to shrink."></button>
      <div data-part="header">
        <h2 data-part="title" id={`${id}-t`}>{title}</h2>
        {hasDescription.value && <p data-part="description" id={`${id}-d`}>{description}</p>}
        <button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-icon-only="" aria-label="Close" data-part="close" data-close=""><XIcon /></button>
      </div>
      <div data-part="body">{children}</div>
      {foot.value !== undefined && <div data-part="footer">{foot.value}</div>}
    </dialog>
  )
}
