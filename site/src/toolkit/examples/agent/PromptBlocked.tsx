import { Prompt } from '@weft-js/warp'

export const PromptBlocked = () => (
  <Prompt blocked="You're offline" value="Roll back mobile-bff" tools={[]} />
)
