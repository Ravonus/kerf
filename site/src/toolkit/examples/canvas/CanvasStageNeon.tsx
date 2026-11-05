import { CanvasStage } from '@weft-js/warp'
import { lookStyle, Skins } from './stage-landing'
import { LOOKS } from './looks'

export const NEON_STYLE = lookStyle('neon', 'padding:28px')

export const CanvasStageNeon = () => (
  <CanvasStage {...LOOKS.neon.stage} animate style={NEON_STYLE}>
    <Skins group="look-neon" />
  </CanvasStage>
)
