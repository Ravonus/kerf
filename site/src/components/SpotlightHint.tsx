import { Button } from '@weft-js/warp'
import { spotlightOpen } from '../lib/spotlight'

export function SpotlightHint() {
  return <Button emphasis="frame" onClick={() => (spotlightOpen.value = true)}>Search the docs</Button>
}
