import { CheckIcon } from '@weft/icons'
import { derived } from 'weft'
import type { Interaction } from 'weft/interaction'
import { Icon, type IconRef } from './Icon'
import { useUi } from './use'
import './fields'
import '@weft/ui-core/styles/inputs/choice.css'
// the inputs form sits on the components chip (inputs.html loads both): pressed fill, forced colours
import '@weft/ui-core/styles/components/chip.css'
import '@weft/ui-core/styles/components/toggle-button.css'

const sweepParts = () => <><span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span></>

/** A filter chip (03 §4 Chips): a toggle button; pressed pins the sweep on accent-soft and draws the check. */
export function Chip({ pressed, count, icon, ui, ref, children, ...rest }: { pressed?: boolean; count?: any; icon?: IconRef; ui?: Interaction; children?: any; [attr: string]: any }) {
  let host: HTMLButtonElement | undefined
  useUi(() => ui, () => host)
  const glyph = derived(() => icon)
  return (
    <button type="button" data-scope="chip" data-sweep="" aria-pressed={pressed ? 'true' : 'false'} {...rest} ref={(n: any) => { host = n; ref?.(n) }}>
      {sweepParts()}
      {pressed ? <CheckIcon data-part="check" /> : glyph.value && <Icon name={glyph.value} />}
      {children}
      {count !== undefined && <span data-part="count">{count}</span>}
    </button>
  )
}
