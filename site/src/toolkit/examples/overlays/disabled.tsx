import { Button, Tooltip } from '@weft-js/warp'

export const TooltipWhyDisabled = () => (
  <Tooltip content="Only owners can delete a project">
    <Button
      tone="critical"
      aria-disabled="true"
    >
      Delete project
    </Button>
  </Tooltip>
)
