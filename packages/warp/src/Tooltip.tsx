import { tooltip, uid, type Align, type Side } from '@weft-js/warp-core'
import { untrack } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/tooltip.css'

/**
 * A hint on hover and keyboard focus, never essential (05 §3, §10 H1): `children` is the trigger (one focusable
 * element); the tip follows it in the DOM as a manual popover in the top layer. The trigger is described by the tip
 * unless its accessible name already says the same words (an icon button named "Settings" with tip "Settings").
 * `inline` draws the tip shown, under its trigger in the page's flow, for docs and previews: no top layer, no hover wait.
 */
export function Tooltip({
  content,
  kbd,
  side,
  align,
  inline,
  children,
}: {
  content: string
  kbd?: string
  side?: Side
  align?: Align
  /** Shown under the trigger, in the page's flow: no top layer or hover wait. For docs and previews. */ inline?: boolean
  children: unknown
}) {
  const id = uid('tip')
  const flat = untrack(() => !!inline)
  let tip: HTMLDivElement | undefined
  // the trigger is the element before the tip; it is described by the tip unless its name already says the same
  const attach = (el: HTMLElement, o: { side?: Side | undefined; align?: Align | undefined }) => {
    const trigger = el.previousElementSibling as HTMLElement
    if (trigger.getAttribute('aria-label') !== el.textContent)
      trigger.setAttribute(
        'aria-describedby',
        [trigger.getAttribute('aria-describedby'), id].filter(Boolean).join(' '),
      )
    if (flat) return { update() {}, destroy() {} } // shown in flow: nothing to place, open or close
    const action = tooltip(el, { trigger, side: o.side, align: o.align })
    return {
      update: (n: { side?: Side | undefined; align?: Align | undefined }) =>
        action.update({ trigger, side: n.side, align: n.align }),
      destroy: () => action.destroy(),
    }
  }
  use(
    attach,
    () => tip,
    () => ({ side, align }),
  )
  return (
    <>
      {children}
      <div
        ref={(n) => (tip = n)}
        data-scope="tooltip"
        data-part="content"
        role="tooltip"
        popover={flat ? undefined : 'manual'}
        data-presentation={flat ? 'inline' : undefined}
        id={id}
      >
        {content}
        {kbd && <kbd>{kbd}</kbd>}
      </div>
    </>
  )
}
