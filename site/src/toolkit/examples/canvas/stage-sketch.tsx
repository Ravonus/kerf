import { CanvasStage } from '@weft-js/warp'
import { lookStyle, Skins } from './stage-landing'
import { LOOKS } from './looks'

export const SKETCH_STYLE = lookStyle(
  'sketch',
  'padding:28px 28px 28px 40px',
)

export const CanvasStageSketch = () => (
  <CanvasStage
    {...LOOKS.sketch.stage}
    style={SKETCH_STYLE}
  >
    <Skins group="look-sketch" />
  </CanvasStage>
)
