import { Reasoning } from '@kerf/veneer'

export const ReasoningFinished = () => (
  <Reasoning
    seconds={4}
    text={
      'The build passed, so the failure ' +
      'is in the health check. The log ' +
      'shows ap-south timing out three ' +
      'times in a row.'
    }
  />
)
