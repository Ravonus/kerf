import { Button, Tooltip } from '@kerf/veneer'

export const TooltipBasic = () => (
  <Tooltip content="Runs on every region">
    <Button
      emphasis="outline"
      tone="neutral"
    >
      Deploy everywhere
    </Button>
  </Tooltip>
)
