import { Reasoning } from '@kerf-js/veneer'

export const ReasoningThinking = () => (
  <Reasoning
    streaming
    text={
      'The build passed, so the failure ' +
      "is in the health check. I'll read " +
      'which check failed and in which ' +
      'region.'
    }
  />
)
