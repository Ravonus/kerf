import { Segmented } from '@weft-js/warp'
import { state } from '@weft-js/core'

const STOPS = [
  { value: 'quiet', label: 'Quiet' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'vivid', label: 'Vivid' },
]

/** Sets one attribute on the page's stages. Nothing re-renders: Warp's tokens and icons read the nearest one. */
export function TierPicker() {
  const stop = state('balanced')
  const pick = (v: string) => {
    stop.value = v
    for (const el of document.querySelectorAll('[data-site="stages"]'))
      el.setAttribute('data-expression', v)
  }
  return <Segmented label="Expression" value={stop.value} onChange={pick} options={STOPS} />
}
