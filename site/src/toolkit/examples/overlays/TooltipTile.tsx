import { Button, Tooltip } from '@weft-js/warp'

export const TooltipTile = () => (
  <div style="display:grid;justify-items:center">
    <Tooltip inline content="Runs on every region" kbd="⌘D">
      <Button emphasis="outline" tone="neutral">
        Deploy everywhere
      </Button>
    </Tooltip>
  </div>
)
