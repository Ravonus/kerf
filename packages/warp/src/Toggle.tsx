import { installSweep } from '@weft/ui-core'
import { derived, onMount } from 'weft'
import { Icon, type IconName } from './Icon'
import './styles'
import '@weft/ui-core/styles/components/toggle-button.css'
import '@weft/ui-core/styles/components/chip.css' // the pressed toggle's forced-colours rule lives with the chip

/** A toggle button (05 §2): `aria-pressed`, the sweep held while pressed. */
export function Toggle({ pressed, icon, label, size, children, ...rest }: { pressed: boolean; icon?: IconName; label?: string; size?: 'sm' | 'md' | 'lg'; children?: any; [attr: string]: any }) {
  onMount(() => installSweep())
  const glyph = derived(() => icon)
  return (
    <button type="button" data-scope="toggle" aria-pressed={pressed ? 'true' : 'false'} aria-label={label} data-size={size === 'md' ? undefined : size} data-sweep="" data-phase="idle" {...rest}>
      {glyph.value && <Icon name={glyph.value} />}{children}<span data-part="sweep" aria-hidden="true"></span>
    </button>
  )
}
