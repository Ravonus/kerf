import { XIcon } from '@weft/icons'
import { dialog, uid } from '@weft/warp-core'
import { derived, untrack, type State } from 'weft'
import type { Tone } from './Button'
import { use } from '@weft/warp-core/weft'
import './styles'
import '@weft/warp-core/styles/components/button.css' // the close button's markup
import '@weft/warp-core/styles/components/dialog.css'

/**
 * A modal dialog on the native <dialog> (05 §3; components.html:1067-1090): showModal, focus to [autofocus] or the
 * title, back to the opener on every close path, scroll lock by CSS. Named by its title, described by its
 * description. `open` is a box: the dialog writes false when the user closes it. `alert` makes it an alert dialog
 * (no backdrop dismiss; focus Cancel by giving it autofocus). `inline` draws it open in the page's flow, for docs and
 * previews: a non-modal <dialog open> with no top layer, scrim, focus trap or scroll lock; `open` still shows and hides it.
 */
export function Modal({ open, title, description, footer, size, placement, alert, tone, mark, inline, children }: { open: State<boolean>; title: any; description?: any; footer?: any; size?: 'sm' | 'md' | 'lg'; /** Where it sits, and the edge it arrives from. */ placement?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'full'; alert?: boolean; tone?: Tone; /** Drawn above the title (09's result mark). */ mark?: any; /** Drawn open in the page's flow, not over it: no top layer, scrim or focus trap. For docs and previews. */ inline?: boolean; children?: any }) {
  const id = uid('dlg')
  const hasDescription = derived(() => description !== undefined)
  const sign = derived(() => mark)
  const foot = derived(() => footer) // one build of the footer, however often it is read
  let el: HTMLDialogElement | undefined
  const flat = untrack(() => !!inline)
  if (!flat) use(dialog, () => el, () => ({ open: open.value, onClose: () => (open.value = false) }))
  // inline: [data-close] still closes it, by `open`, as the dialog action would
  const closer = flat ? (e: Event) => { if ((e.target as Element).closest?.('[data-close]')) open.value = false } : undefined
  return (
    <dialog ref={(n: any) => (el = n)} open={flat ? open.value : undefined} data-presentation={flat ? 'inline' : undefined} onClick={closer} data-scope="dialog" role={alert ? 'alertdialog' : undefined} data-size={size === 'md' ? undefined : size} data-placement={placement === 'center' ? undefined : placement} data-tone={tone} aria-labelledby={`${id}-t`} aria-describedby={hasDescription.value ? `${id}-d` : undefined}>
      <div data-part="header">
        {sign.value}
        <h2 data-part="title" id={`${id}-t`}>{title}</h2>
        {hasDescription.value && <p data-part="description" id={`${id}-d`}>{description}</p>}
        {/* <Button emphasis="ghost" tone="neutral" icon={XIcon} label="Close"> as its markup: a ghost button needs no JS */}
        <button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-icon-only="" aria-label="Close" data-part="close" data-close=""><XIcon /></button>
      </div>
      <div data-part="body">{children}</div>
      {foot.value !== undefined && <div data-part="footer">{foot.value}</div>}
    </dialog>
  )
}
