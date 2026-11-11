import { Button, Tooltip } from '@kerf/veneer'

export const TooltipAligns = () => (
  <>
    <Tooltip
      content="Lines up with the start"
      align="start"
    >
      <Button
        emphasis="outline"
        tone="neutral"
      >
        Start
      </Button>
    </Tooltip>
    <Tooltip
      content="Centred on the button"
      align="center"
    >
      <Button
        emphasis="outline"
        tone="neutral"
      >
        Center
      </Button>
    </Tooltip>
    <Tooltip
      content="Lines up with the end"
      align="end"
    >
      <Button
        emphasis="outline"
        tone="neutral"
      >
        End
      </Button>
    </Tooltip>
  </>
)
