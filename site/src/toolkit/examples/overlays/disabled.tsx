import { Button, Tooltip } from '@kerf-js/veneer'

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
