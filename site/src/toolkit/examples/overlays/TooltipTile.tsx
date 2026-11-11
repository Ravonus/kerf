import { Button, Tooltip } from '@kerf/veneer'

export const TooltipTile = () => (
  <div style="display:grid;justify-items:center">
    <Tooltip
      inline
      content="Runs on every region"
      kbd="⌘D"
    >
      <Button
        emphasis="outline"
        tone="neutral"
      >
        Deploy everywhere
      </Button>
    </Tooltip>
  </div>
)
