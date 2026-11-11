import { Assistant } from '@kerf/veneer'
import { CUT_OFF } from './shared'

export const AssistantStopped = () => (
  <Assistant
    answer={CUT_OFF}
    quiet
  />
)
