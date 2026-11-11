import { Badge } from '@kerf/veneer'

export const BadgeEmphasis = () => (
  <>
    <Badge tone="positive">Status</Badge>
    <Badge
      tone="positive"
      emphasis="solid"
    >
      Status
    </Badge>
    <Badge
      tone="positive"
      emphasis="outline"
    >
      Status
    </Badge>
  </>
)
