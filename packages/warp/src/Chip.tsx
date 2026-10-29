import { installSweep } from '@weft/ui-core'
import { onMount, untrack } from 'weft'
import { Icon, type IconName } from './Icon'
import './fields'
import '@weft/ui-core/styles/inputs/choice.css'
// the inputs form sits on the components chip (inputs.html loads both): pressed fill, forced colours
import '@weft/ui-core/styles/components/chip.css'
import '@weft/ui-core/styles/components/toggle-button.css'

const sweepParts = () => <><span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span></>

/** A filter chip (03 §4 Chips): a toggle button; pressed pins the sweep on accent-soft and draws the check. */
export function Chip({ pressed, count, icon, children, ...rest }: { pressed?: boolean; count?: any; icon?: IconName; children?: any; [attr: string]: any }) {
  onMount(() => installSweep())
  const glyph = untrack(() => icon)
  return (
    <button type="button" data-scope="chip" data-sweep="" data-phase="idle" aria-pressed={pressed ? 'true' : 'false'} {...rest}>
      {sweepParts()}
      {pressed ? <Icon name="check" data-part="check" /> : glyph && <Icon name={glyph} />}
      {children}
      {count !== undefined && <span data-part="count">{count}</span>}
    </button>
  )
}
