import { popover, uid, type Align, type Side } from '@weft-js/warp-core'
import { state } from '@weft-js/core'
import { Button, type ButtonProps } from './Button'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/popover.css'

/**
 * A button that opens a non-modal dialog panel (05 §3; components.html:574-586, 1557-1571): the outline trigger holds
 * its sweep while open (aria-expanded); focus moves into the panel and back to the trigger; Escape, a press outside
 * or focus leaving closes it; [data-close-popover] buttons inside close it. Named by its title, else by its trigger.
 */
export function Popover({ label, title, description, side, align, trigger, children }: { label: unknown; title?: unknown; description?: unknown; side?: Side | undefined; align?: Align; trigger?: ButtonProps | undefined; children?: unknown }) {
  const id = uid('pop')
  const open = state(false)
  let button: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  use(popover, () => panel, () => ({ open: open.value, trigger: button!, side, align, onClose: () => (open.value = false) }))
  return (
    <>
      <Button emphasis="outline" tone="neutral" {...(trigger ?? {})} ref={(el: HTMLButtonElement) => (button = el)} id={`${id}-b`} aria-haspopup="dialog" aria-expanded={open.value ? 'true' : 'false'} aria-controls={id} onClick={() => (open.value = !open.value)}>
        {label}
      </Button>
      <div ref={n => (panel = n)} data-scope="popover" data-part="content" role="dialog" popover="manual" id={id} aria-labelledby={title !== undefined ? `${id}-t` : `${id}-b`}>
        {title !== undefined && <p data-part="title" id={`${id}-t`}>{title}</p>}
        {description !== undefined && <p data-part="description">{description}</p>}
        {children}
      </div>
    </>
  )
}
