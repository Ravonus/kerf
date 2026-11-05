import { Assistant } from '@weft-js/warp'
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
