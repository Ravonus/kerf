import { getDial, Segmented, setDial } from '@weft/warp'
import { onMount, state } from 'weft'

const STOPS = [{ value: 'quiet', label: 'Quiet' }, { value: 'balanced', label: 'Balanced' }, { value: 'vivid', label: 'Vivid' }]

/** The dial, where its effect shows: it writes the same root attribute as the header's Appearance menu. */
export function DialSwitch() {
  const stop = state('balanced')
  onMount(() => { stop.value = getDial('expression') })
  return <Segmented size="sm" label="Expression" value={stop.value} options={STOPS} onChange={v => { stop.value = v; setDial('expression', v, { persist: true }) }} />
}
