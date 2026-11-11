import { Prompt } from '@kerf-js/veneer'

export const PromptBlocked = () => (
  <Prompt
    blocked="You're offline"
    value="Roll back mobile-bff"
    tools={[]}
  />
)
