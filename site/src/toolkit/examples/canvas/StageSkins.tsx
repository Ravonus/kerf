import { DitherStage } from '@kerf-js/veneer'
import { Skins } from './stage-landing'

// -- DitherStage
export const StageSkins = () => (
  <DitherStage
    kind="drift"
    ground={0.35}
    style="padding:28px"
  >
    <Skins group="look-dither" />
  </DitherStage>
)
