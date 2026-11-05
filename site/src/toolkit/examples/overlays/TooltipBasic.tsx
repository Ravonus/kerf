import { Button, Tooltip } from '@weft-js/warp'

export const TooltipBasic = () => (
  <Tooltip content="Runs on every region">
    <Button emphasis="outline" tone="neutral">
      Deploy everywhere
    </Button>
  </Tooltip>
)
