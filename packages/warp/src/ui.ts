// How warp draws `ui`, from any source (research 45). The `weft()` plugin imports this where `ui=` is used, so a
// component that never gets a `ui` carries none of it.
//
// A lit row is `data-hold`, warp's existing word for "drawn active with no pointer on it", so no component needs a new
// rule. `data-remote` says only someone else has it, for whoever wants to tint that.
import { interact } from '@weft-js/warp-core'
import { createRoot, effect } from '@weft-js/core'
import { seams } from '@weft-js/core/interaction'

seams.attach = (el, ui) => {
  const real = interact(el, ui)
  const stop = createRoot(dispose => {
    effect(() => {
      const r = ui.remote.value
      const mine = ui.hover.value || ui.focus.value || ui.pressed.value
      return mine ? 2 : r.hover || r.focus || r.pressed ? 1 : 0
    }, lit => {
      el.toggleAttribute('data-hold', lit > 0)
      el.toggleAttribute('data-remote', lit === 1)
    })
    return dispose
  }, null)
  return { update() {}, destroy() { real.destroy(); stop(); el.removeAttribute('data-hold'); el.removeAttribute('data-remote') } }
}
