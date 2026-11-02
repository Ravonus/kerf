import { tooltip, uid, type Align, type Side } from '@weft/warp-core'
import { use } from '@weft/warp-core/weft'
import './styles'
import '@weft/warp-core/styles/components/tooltip.css'

/**
 * A hint on hover and keyboard focus, never essential (05 §3, §10 H1): `children` is the trigger (one focusable
 * element); the tip follows it in the DOM as a manual popover in the top layer. The trigger is described by the tip
 * unless its accessible name already says the same words (an icon button named "Settings" with tip "Settings").
 */
export function Tooltip({ content, kbd, side, align, children }: { content: string; kbd?: string; side?: Side; align?: Align; children: any }) {
  const id = uid('tip')
  let tip: HTMLDivElement | undefined
  // the trigger is the element before the tip; it is described by the tip unless its name already says the same
  const attach = (el: HTMLElement, o: { side?: Side; align?: Align }) => {
    const trigger = el.previousElementSibling as HTMLElement
    if (trigger.getAttribute('aria-label') !== el.textContent) trigger.setAttribute('aria-describedby', [trigger.getAttribute('aria-describedby'), id].filter(Boolean).join(' '))
    const action = tooltip(el, { trigger, side: o.side, align: o.align })
    return { update: (n: { side?: Side; align?: Align }) => action.update({ trigger, side: n.side, align: n.align }), destroy: () => action.destroy() }
  }
  use(attach, () => tip, () => ({ side, align }))
  return (
    <>
      {children}
      <div ref={(n: any) => (tip = n)} data-scope="tooltip" data-part="content" role="tooltip" popover="manual" id={id}>{content}{kbd && <kbd>{kbd}</kbd>}</div>
    </>
  )
}
