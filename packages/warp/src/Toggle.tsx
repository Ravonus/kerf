import { derived } from '@weft-js/core'
import type { Interaction } from '@weft-js/core/interaction'
import { Icon, type IconRef } from './Icon'
import { useUi } from './use-ui'
import './styles'
import '@weft-js/warp-core/styles/components/toggle-button.css'
import '@weft-js/warp-core/styles/components/chip.css' // the pressed toggle's forced-colours rule lives with the chip

/** A toggle button (05 §2): `aria-pressed`, the sweep held while pressed. */
export function Toggle({ pressed, icon, label, size, ui, ref, children, onClick, onPointerEnter, ...rest }: { pressed: boolean; icon?: IconRef; label?: string; size?: 'sm' | 'md' | 'lg'; ui?: Interaction; children?: any; [attr: string]: any }) {
  let host: HTMLButtonElement | undefined
  useUi(() => ui, () => host)
  const glyph = derived(() => icon)
  // Released from pressed, the fill goes at once; the held stroke goes with it when the pointer and focus leave, so it
  // doesn't retract across the face as a stray bracket. A plain hover keeps the sweep's own exit.
  const click = (e: MouseEvent) => {
    if (host?.getAttribute('aria-pressed') === 'true') host.dataset.released = ''
    else delete host?.dataset.released
    onClick?.(e)
  }
  const enter = (e: PointerEvent) => { if (host?.getAttribute('aria-pressed') !== 'true') delete host?.dataset.released; onPointerEnter?.(e) }
  return (
    <button type="button" data-scope="toggle" aria-pressed={pressed ? 'true' : 'false'} aria-label={label} data-size={size === 'md' ? undefined : size} data-sweep="" {...rest} onClick={click} onPointerEnter={enter} ref={(n: any) => { host = n; ref?.(n) }}>
      {glyph.value && <Icon name={glyph.value} />}{children}<span data-part="sweep" aria-hidden="true"></span>
    </button>
  )
}
