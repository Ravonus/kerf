import { Button, Tooltip } from '@kerf-js/veneer'

export const TooltipShortcut = () => (
  <Tooltip
    content="Search commands"
    kbd="⌘K"
  >
    <Button
      emphasis="outline"
      tone="neutral"
      icon="search"
      label="Search"
    />
  </Tooltip>
)
