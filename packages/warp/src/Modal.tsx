import { dialog, uid } from '@weft/ui-core'
import { untrack, type State } from 'weft'
import { Button, type Tone } from './Button'
import { use } from './use'
import './styles'
import '@weft/ui-core/styles/components/dialog.css'

/**
 * A modal dialog on the native <dialog> (05 §3; components.html:1067-1090): showModal, focus to [autofocus] or the
 * title, back to the opener on every close path, scroll lock by CSS. Named by its title, described by its
 * description. `open` is a box: the dialog writes false when the user closes it. `alert` makes it an alert dialog
 * (no backdrop dismiss; focus Cancel by giving it autofocus).
 */
export function Modal({ open, title, description, footer, size, alert, tone, children }: { open: State<boolean>; title: any; description?: any; footer?: any; size?: 'sm' | 'md' | 'lg'; alert?: boolean; tone?: Tone; children?: any }) {
  const id = uid('dlg')
  const hasDescription = untrack(() => description !== undefined)
  const foot = untrack(() => footer) // made once: reading a JSX prop twice would build it twice
  let el: HTMLDialogElement | undefined
  use(dialog, () => el, () => ({ open: open.value, onClose: () => (open.value = false) }))
  return (
    <dialog ref={(n: any) => (el = n)} data-scope="dialog" role={alert ? 'alertdialog' : undefined} data-size={size === 'md' ? undefined : size} data-tone={tone} aria-labelledby={`${id}-t`} aria-describedby={hasDescription ? `${id}-d` : undefined}>
      <div data-part="header">
        <h2 data-part="title" id={`${id}-t`}>{title}</h2>
        {hasDescription && <p data-part="description" id={`${id}-d`}>{description}</p>}
        <Button emphasis="ghost" tone="neutral" icon="x" label="Close" data-part="close" data-close="" />
      </div>
      <div data-part="body">{children}</div>
      {foot !== undefined && <div data-part="footer">{foot}</div>}
    </dialog>
  )
}
