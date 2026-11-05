import { CanvasStage } from '@weft-js/warp'
import { lookStyle, Choose } from './stage-landing'
import { LOOKS } from './looks'

export const FLAT_CHOOSE = lookStyle(
  'flat',
  'padding:28px;min-block-size:300px',
)

export const StageSelectFlat = () => (
  <CanvasStage
    {...LOOKS.flat.stage}
    style={FLAT_CHOOSE}
  >
    <Choose />
  </CanvasStage>
)
