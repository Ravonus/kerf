import { Assistant } from '@weft-js/warp'
import { CUT_OFF } from './shared'

export const AssistantStopped = () => (
  <Assistant
    answer={CUT_OFF}
    quiet
  />
)
