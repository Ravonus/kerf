import { derived } from '@weft-js/core'
import type { Interaction } from '@weft-js/core/interaction'
import { Icon, type IconRef } from './Icon'
import { useUi } from './use-ui'
import './styles'
import '@weft-js/warp-core/styles/components/toggle-button.css'
import '@weft-js/warp-core/styles/components/chip.css' // the pressed toggle's forced-colours rule lives with the chip

/** A toggle button (05 §2): `aria-pressed`, the sweep held while pressed. */
export function Toggle({ pressed, icon, label, size, ui, ref, children, ...rest }: { pressed: boolean; icon?: IconRef; label?: string; size?: 'sm' | 'md' | 'lg'; ui?: Interaction; children?: any; [attr: string]: any }) {
  let host: HTMLButtonElement | undefined
  useUi(() => ui, () => host)
  const glyph = derived(() => icon)
  return (
    <button type="button" data-scope="toggle" aria-pressed={pressed ? 'true' : 'false'} aria-label={label} data-size={size === 'md' ? undefined : size} data-sweep="" {...rest} ref={(n: any) => { host = n; ref?.(n) }}>
      {glyph.value && <Icon name={glyph.value} />}{children}<span data-part="sweep" aria-hidden="true"></span>
    </button>
  )
}
