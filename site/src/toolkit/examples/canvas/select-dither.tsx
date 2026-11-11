import { DitherStage } from '@kerf/veneer'
import { Choose } from './stage-landing'

export const StageSelectDither = () => (
  <DitherStage
    ground={0.3}
    style="padding:28px;min-block-size:300px"
  >
    <Choose />
  </DitherStage>
)
