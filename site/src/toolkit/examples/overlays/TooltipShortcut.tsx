import { Button, Tooltip } from '@weft-js/warp'

export const TooltipShortcut = () => (
  <Tooltip content="Search commands" kbd="⌘K">
    <Button emphasis="outline" tone="neutral" icon="search" label="Search" />
  </Tooltip>
)
