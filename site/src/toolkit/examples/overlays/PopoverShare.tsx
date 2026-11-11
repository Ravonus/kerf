import { Popover, Snippet } from '@kerf/veneer'

export const PopoverShare = () => (
  <Popover
    label="Share"
    trigger={{ icon: 'link' }}
    title="Share this preview"
    description={
      'Anyone with the link can look. It' +
      ' stops working when the branch is deleted.'
    }
  >
    <Snippet
      prompt=""
      code="https://ranking-v2.search-api.kerf.app"
    />
  </Popover>
)
