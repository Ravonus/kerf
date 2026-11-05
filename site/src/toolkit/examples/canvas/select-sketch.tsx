import { CanvasStage } from '@weft-js/warp'
import { lookStyle, Choose } from './stage-landing'
import { LOOKS } from './looks'

export const SKETCH_CHOOSE = lookStyle(
  'sketch',
  'padding:28px 28px 28px 40px;min-block-size:300px',
)

export const StageSelectSketch = () => (
  <CanvasStage
    {...LOOKS.sketch.stage}
    style={SKETCH_CHOOSE}
  >
    <Choose />
  </CanvasStage>
)
