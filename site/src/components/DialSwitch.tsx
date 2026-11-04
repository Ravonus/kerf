import { getDial, Segmented, setDial, type SegmentedOption } from '@weft-js/warp'
import { onMount, state } from '@weft-js/core'
import { shownExpression } from '../lib/dial'

type Tier = 'quiet' | 'balanced' | 'vivid'

const STOPS: SegmentedOption<Tier>[] = [{ value: 'quiet', label: 'Quiet' }, { value: 'balanced', label: 'Balanced' }, { value: 'vivid', label: 'Vivid' }]

/**
 * The dial, where its effect shows: it writes the same root attribute as the header's Appearance menu. The server
 * renders the site's default, which is what a fresh visitor has; a saved stop is checked by the head before paint.
 */
export function DialSwitch() {
  const stop = state<Tier>(shownExpression())
  onMount(() => { stop.value = getDial('expression') })
  return (
    <div data-site="dial" data-dial="expression">
      <Segmented size="sm" label="Expression" value={stop.value} options={STOPS} onChange={v => { stop.value = v; setDial('expression', v, { persist: true }) }} />
    </div>
  )
}
