import { CheckIcon } from '@weft/icons'
import { derived } from 'weft'
import { Icon, type IconRef } from './Icon'
import './fields'
import '@weft/warp-core/styles/inputs/choice.css'
// the inputs form sits on the components chip (inputs.html loads both): pressed fill, forced colours
import '@weft/warp-core/styles/components/chip.css'
import '@weft/warp-core/styles/components/toggle-button.css'

const sweepParts = () => <><span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span></>

/** A filter chip (03 §4 Chips): a toggle button; pressed pins the sweep on accent-soft and draws the check. */
export function Chip({ pressed, count, icon, children, ...rest }: { pressed?: boolean; count?: any; icon?: IconRef; children?: any; [attr: string]: any }) {
  const glyph = derived(() => icon)
  return (
    <button type="button" data-scope="chip" data-sweep="" aria-pressed={pressed ? 'true' : 'false'} {...rest}>
      {sweepParts()}
      {pressed ? <CheckIcon data-part="check" /> : glyph.value && <Icon name={glyph.value} />}
      {children}
      {count !== undefined && <span data-part="count">{count}</span>}
    </button>
  )
}
