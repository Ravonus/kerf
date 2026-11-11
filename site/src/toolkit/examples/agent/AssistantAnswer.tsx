import { Assistant } from '@kerf/veneer'
import { FINISHED } from './shared'

export const AssistantAnswer = () => (
  <Assistant
    answer={FINISHED}
    n={1}
    quiet
    onFeedback={() => {}}
    onRegenerate={() => {}}
  />
)
