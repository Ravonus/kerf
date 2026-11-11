import { Badge } from '@kerf/veneer'

export const BadgeDot = () => (
  <>
    <Badge
      tone="positive"
      dot
    >
      Live
    </Badge>
    <Badge
      tone="info"
      dot
    >
      Building
    </Badge>
    <Badge
      tone="critical"
      dot
    >
      Failed
    </Badge>
    <Badge
      tone="neutral"
      dot
    >
      Paused
    </Badge>
  </>
)
