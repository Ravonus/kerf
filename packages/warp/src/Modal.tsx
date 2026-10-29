import { dialog, uid } from '@weft/ui-core'
import { derived, type State } from 'weft'
import type { Tone } from './Button'
import { use } from './use'
import './styles'
import '@weft/ui-core/styles/components/button.css' // the close button's markup
import '@weft/ui-core/styles/components/dialog.css'

/**
 * A modal dialog on the native <dialog> (05 §3; components.html:1067-1090): showModal, focus to [autofocus] or the
 * title, back to the opener on every close path, scroll lock by CSS. Named by its title, described by its
 * description. `open` is a box: the dialog writes false when the user closes it. `alert` makes it an alert dialog
 * (no backdrop dismiss; focus Cancel by giving it autofocus).
 */
export function Modal({ open, title, description, footer, size, alert, tone, children }: { open: State<boolean>; title: any; description?: any; footer?: any; size?: 'sm' | 'md' | 'lg'; alert?: boolean; tone?: Tone; children?: any }) {
  const id = uid('dlg')
  const hasDescription = derived(() => description !== undefined)
  const foot = derived(() => footer) // one build of the footer, however often it is read
  let el: HTMLDialogElement | undefined
  use(dialog, () => el, () => ({ open: open.value, onClose: () => (open.value = false) }))
  return (
    <dialog ref={(n: any) => (el = n)} data-scope="dialog" role={alert ? 'alertdialog' : undefined} data-size={size === 'md' ? undefined : size} data-tone={tone} aria-labelledby={`${id}-t`} aria-describedby={hasDescription.value ? `${id}-d` : undefined}>
      <div data-part="header">
        <h2 data-part="title" id={`${id}-t`}>{title}</h2>
        {hasDescription.value && <p data-part="description" id={`${id}-d`}>{description}</p>}
        {/* <Button emphasis="ghost" tone="neutral" icon="x" label="Close"> as its markup: a ghost button needs no JS */}
        <button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-icon-only="" aria-label="Close" data-part="close" data-close=""><svg data-icon viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg></button>
      </div>
      <div data-part="body">{children}</div>
      {foot.value !== undefined && <div data-part="footer">{foot.value}</div>}
    </dialog>
  )
}
