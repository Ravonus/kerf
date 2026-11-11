import { Prompt } from '@kerf/veneer'

export const PromptBlocked = () => (
  <Prompt
    blocked="You're offline"
    value="Roll back mobile-bff"
    tools={[]}
  />
)
