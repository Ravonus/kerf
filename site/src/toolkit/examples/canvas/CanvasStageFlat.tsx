import { CanvasStage } from '@weft-js/warp'
import { lookStyle, Skins } from './stage-landing'
import { LOOKS } from './looks'

export const FLAT_STYLE = lookStyle(
  'flat',
  'padding:28px',
)

export const CanvasStageFlat = () => (
  <CanvasStage
    {...LOOKS.flat.stage}
    style={FLAT_STYLE}
  >
    <Skins group="look-flat" />
  </CanvasStage>
)
