import { Button, Tooltip } from '@weft-js/warp'

export const TooltipPlay = (p: {
  content: string
  side: 'top' | 'bottom' | 'left' | 'right'
  kbd: string
}) => (
  <Tooltip
    content={p.content}
    side={p.side}
    kbd={p.kbd}
  >
    <Button
      emphasis="outline"
      tone="neutral"
    >
      Hover or focus me
    </Button>
  </Tooltip>
)
