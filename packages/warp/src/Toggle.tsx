import { derived } from 'weft'
import { Icon, type IconRef } from './Icon'
import './styles'
import '@weft/warp-core/styles/components/toggle-button.css'
import '@weft/warp-core/styles/components/chip.css' // the pressed toggle's forced-colours rule lives with the chip

/** A toggle button (05 §2): `aria-pressed`, the sweep held while pressed. */
export function Toggle({ pressed, icon, label, size, children, ...rest }: { pressed: boolean; icon?: IconRef; label?: string; size?: 'sm' | 'md' | 'lg'; children?: any; [attr: string]: any }) {
  const glyph = derived(() => icon)
  return (
    <button type="button" data-scope="toggle" aria-pressed={pressed ? 'true' : 'false'} aria-label={label} data-size={size === 'md' ? undefined : size} data-sweep="" {...rest}>
      {glyph.value && <Icon name={glyph.value} />}{children}<span data-part="sweep" aria-hidden="true"></span>
    </button>
  )
}
